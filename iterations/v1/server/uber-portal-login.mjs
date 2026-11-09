import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MERCHANTS = 'https://merchants.ubereats.com/manager/'

export async function portalLoginUber({ cliHome, username, password }) {
  const user = String(username || process.env.UBER_USER || '').trim()
  const pass = String(password || process.env.UBER_PASS || '').trim()
  if (!user || !pass) return { ok: false, skipped: true }

  let chromium
  try {
    ({ chromium } = await import('playwright'))
  } catch {
    return {
      ok: false,
      error:
        'Falta Playwright en el panel. En el servidor: cd iterations/v1 && npm install && npx playwright install chromium',
    }
  }

  fs.mkdirSync(cliHome, { recursive: true })
  const headless = process.env.UBER_LOGIN_HEADFUL !== '1'
  let browser
  try {
    browser = await chromium.launch({ headless })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('dependencies') || message.includes('libgtk') || message.includes('launch')) {
      return {
        ok: false,
        error:
          'Faltan librerías de Chromium en el servidor. Ejecutá: cd iterations/v1 && sudo npx playwright install-deps && npx playwright install chromium. Mientras tanto pegá el header Cookie abajo.',
      }
    }
    return { ok: false, error: message.slice(0, 240) }
  }
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  try {
    await page.goto(MERCHANTS, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2500)
    const email = page.locator('input[type="email"], input[name="email"], input[id*="email"]').first()
    if (await email.count()) {
      await email.fill(user)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(2500)
    }
    const pwd = page.locator('input[type="password"], input[name="password"]').first()
    if (await pwd.count()) {
      await pwd.fill(pass)
      await page.keyboard.press('Enter')
    }
    await page.waitForURL('**/manager/**', { timeout: 120000 }).catch(() => {})
    await page.waitForTimeout(4000)
    const url = page.url().toLowerCase()
    if (url.includes('login') || url.includes('auth.uber')) {
      return {
        ok: false,
        error: 'Uber no dejó entrar (contraseña, 2FA o captcha). Pegá el header Cookie manualmente.',
      }
    }
    const cookies = await context.cookies()
    const pairs = cookies
      .filter((c) => (c.domain || '').includes('ubereats') || (c.domain || '').includes('uber.com'))
      .map((c) => `${c.name}=${c.value}`)
    if (pairs.length < 2) {
      return { ok: false, error: 'Login sin cookies suficientes; exportá Cookie desde el navegador.' }
    }
    const header = pairs.join('; ')
    const target = path.join(cliHome, '.uber_cookie')
    fs.writeFileSync(target, `${header}\n`, { mode: 0o600 })
    return { ok: true, value: header, source: 'portal-login', length: header.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message.slice(0, 240) }
  } finally {
    await browser.close()
  }
}
