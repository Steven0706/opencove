import { ElectronAPI } from '@electron-toolkit/preload'
import { CoveApi } from '../preload/index'

declare global {
  interface Window {
    electron: ElectronAPI
    coveApi: CoveApi
  }
}
