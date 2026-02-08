/**
 * Smoke Test - Electron 应用启动测试
 *
 * 验证应用可以正常启动并显示主窗口
 */
import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'

// Electron 应用路径
const electronAppPath = path.resolve(__dirname, '../../')

test.describe('Application Startup', () => {
  test('should launch the application and show main window', async () => {
    // 启动 Electron 应用
    const electronApp = await electron.launch({
      args: [electronAppPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    })

    // 等待第一个窗口打开
    const window = await electronApp.firstWindow()

    // 验证窗口已创建
    expect(window).toBeTruthy()

    // 验证页面已加载
    await window.waitForLoadState('domcontentloaded')

    // 验证窗口标题（根据实际应用调整）
    const title = await window.title()
    expect(title).toBeDefined()

    // 验证渲染区域可访问
    const bodyHandle = await window.$('body')
    expect(bodyHandle).toBeTruthy()

    // 截图留证
    await window.screenshot({ path: 'test-results/smoke-test-window.png' })

    // 关闭应用
    await electronApp.close()
  })

  test('should have correct window properties', async () => {
    const electronApp = await electron.launch({
      args: [electronAppPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    })

    await electronApp.firstWindow()

    // 获取 Electron 应用信息
    const appPath = await electronApp.evaluate(async ({ app }) => {
      return app.getAppPath()
    })
    expect(appPath).toBeTruthy()

    // 验证应用名称
    const appName = await electronApp.evaluate(async ({ app }) => {
      return app.getName()
    })
    expect(appName).toBeDefined()

    await electronApp.close()
  })
})
