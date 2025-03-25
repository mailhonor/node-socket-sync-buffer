import { Buffer } from 'node:buffer'
import * as net from "net"
import * as tls from "tls"

export interface options {
  host: string
  port: number
  ssl?: boolean
  timeout?: number
  rejectUnauthorized?: boolean
}

export class socketSyncBuffer {
  private host: string = "127.0.0.1"
  private port: number = 25
  private ssl: boolean = false
  private timeout: number = 0
  private rejectUnauthorized: boolean
  private sslFlag: boolean = false
  private errorFlag: boolean = false
  private timeoutFlag: boolean = false
  private closeFlag: boolean = false
  private socket: net.Socket | tls.TLSSocket
  private socketOriginal: net.Socket
  private undealedReadableData: Buffer | null = null
  private writeCaches: Buffer[] = []
  private systemResolve: any = null
  private tlsConnectResolve: any = null
  private onExtraDataReadableHandler: any = null
  private onExtraDataReadableTrueDoFlag = false

  // options.host: string, 地址
  // options.port: number, 端口
  // options.ssl?: boolean, 是否开启ssl
  // options.timeout?: number, 读写超时(毫秒)
  // options.rejectUnauthorized?: boolean, 如果证书有问题是否拒绝连接
  constructor(options: options) {
    this.socket = new net.Socket()
    this.socketOriginal = this.socket

    // options
    this.host = options.host
    this.port = options.port
    this.ssl = options.ssl || false
    if (options.timeout !== undefined) {
      this.timeout = options.timeout
    }
    this.rejectUnauthorized = options.rejectUnauthorized || false
  }

  setOnExtraDataReadableHandlerOnce(handler: (() => any) | undefined) {
    let that = this
    that.onExtraDataReadableTrueDoFlag = false
    if (handler) {
      that.onExtraDataReadableHandler = handler
    }
    if (this.undealedReadableData && this.undealedReadableData.length > 0) {
      if (that.onExtraDataReadableHandler) {
        that.onExtraDataReadableHandler()
      }
      return
    }
    that.socket.once("readable", () => {
      if ((!that.onExtraDataReadableTrueDoFlag) && that.onExtraDataReadableHandler) {
        that.onExtraDataReadableHandler()
      }
    })
  }

  private _socketEventSet() {
    this.socket.on("error", () => {
      this.errorFlag = true
      this.closeFlag = true
      this._systemResolveStrike(false)
      if (this.tlsConnectResolve) {
        let resolve = this.tlsConnectResolve
        this.tlsConnectResolve = null
        resolve(false)
      }
    })
    this.socket.on("close", () => {
      this.closeFlag = true
      this._systemResolveStrike(false)
      if (this.tlsConnectResolve) {
        let resolve = this.tlsConnectResolve
        this.tlsConnectResolve = null
        resolve(false)
      }
    })
  }

  // 超时设置
  private _setTimeout() {
    if (this.timeout < 0) {
      return
    }
    this.socketOriginal.setTimeout(this.timeout, () => {
      this.timeoutFlag = true
      this.errorFlag = true
      this.closeFlag = true
      this.socketOriginal.end()
    })
  }

  //  发起 ssl 连接
  // 返回值是 boolean 类型, 返回 false 表示网络错误,或连接关闭,返回 true 表示成功
  async tlsConnect() {
    if (this.sslFlag) {
      return true
    }
    return new Promise((resolve: { (tf: boolean): void }) => {
      this.tlsConnectResolve = resolve
      const tlsSocket = tls.connect({
        socket: this.socket,
        rejectUnauthorized: this.rejectUnauthorized
      }, () => {
        this.sslFlag = true
        if (this.tlsConnectResolve) {
          let resolve = this.tlsConnectResolve
          this.tlsConnectResolve = null
          resolve(true)
        }
      })
      this.socket = tlsSocket
      this._socketEventSet()
    })
  }

  async connect() {
    return new Promise((resolve: { (r: boolean): void }) => {
      this.systemResolve = resolve
      this._setTimeout()
      this._socketEventSet()
      this.socket.connect(this.port, this.host, () => {
        if (this.ssl && !this.sslFlag) {
          this.tlsConnect().then((tf: boolean) => {
            this._systemResolveStrike(tf)
          })
        } else {
          this._systemResolveStrike(true)
        }
      })
    })
  }

  // 是否有真实可读数据
  trueDataReadable() {
    let that = this
    that.onExtraDataReadableTrueDoFlag = true
    if (that.undealedReadableData && that.undealedReadableData.length > 0) {
      return true
    }
    if (that.errorFlag || that.closeFlag) {
      return true
    }
    let rdata = that.socket.read()
    if (rdata !== null) {
      that.undealedReadableData = rdata
      return true
    }
    return false
  }

  // 读取数据
  private async _read_once(): Promise<Buffer | null> {
    let that = this
    that.onExtraDataReadableTrueDoFlag = true
    if (that.undealedReadableData && that.undealedReadableData.length > 0) {
      let r = that.undealedReadableData
      that.undealedReadableData = null
      return r
    }
    if (that.errorFlag || that.closeFlag) {
      return null
    }
    if (! await that.flush()) {
      return null
    }
    let rdata = that.socket.read()
    if (rdata !== null) {
      return (rdata as Buffer)
    }
    return new Promise((resolve: { (ret: Buffer | null): void }) => {
      that.systemResolve = resolve
      function _try() {
        that.socket.once("readable", () => {
          let rdata = that.socket.read()
          if (rdata === null) {
            if (that.errorFlag || that.closeFlag) {
              that._systemResolveStrike(null)
              return
            }
            _try()
            return
          }
          that._systemResolveStrike(rdata)
        })
      }
      _try()
    })
  }

  private __return_bfs(bfs: Buffer[]) {
    let r = Buffer.concat(bfs)
    if (r.length > 0) {
      return r;
    } else {
      return null
    }
  }

  // 返回读取的数据, 长度没限制
  // 返回 null 表示网络失败, 或连接关闭, 否则表示成功, 类型为 Buffer
  async read(): Promise<Buffer | null> {
    return this._read_once()
  }

  // 读取指定长度的数据(Buffer)
  // 返回 null 表示网络失败, 或连接关闭, 否则表示成功, 类型为 Buffer
  async readn(size: number): Promise<Buffer | null> {
    let length = 0
    let bfs: Buffer[] = []

    while (1) {
      let bf = await this._read_once()
      if (bf === null) {
        return this.__return_bfs(bfs)
      }
      let need = size - length
      if (bf.length >= need) {
        bfs.push(bf.subarray(0, need));
        this.undealedReadableData = bf.subarray(need);
        return this.__return_bfs(bfs)
      }
      length += bf.length
      bfs.push(bf)
    }
    return this.__return_bfs(bfs)
  }

  // 读到指定分隔符(长度为 1)为止
  // 最多读取 maxSize个字符， maxSize为 0 表示不限制 
  // 返回 null 表示网络失败, 或连接关闭, 否则表示成功, 类型为 Buffer
  async readDelimiter(delimiter: string, maxSize: number = 0): Promise<Buffer | null> {
    let delim = delimiter.charCodeAt(0)
    let i = 0
    let length = 0
    let bfs: Buffer[] = []
    while (1) {
      let bf = await this._read_once()
      if (!bf) {
        return this.__return_bfs(bfs)
      }
      for (i = 0; i < bf.length; i++) {
        if (maxSize > 0 && length + i + 1 >= maxSize) {
          this.undealedReadableData = bf.subarray(i + 1)
          bfs.push(bf.subarray(0, i + 1))
          return this.__return_bfs(bfs)
        }
        let c = bf[i]
        if (c == delim) {
          this.undealedReadableData = bf.subarray(i + 1)
          bfs.push(bf.subarray(0, i + 1))
          return this.__return_bfs(bfs)
        }
      }
      bfs.push(bf)
      length += bf.length
    }
    return this.__return_bfs(bfs)
  }

  // 读一行
  // 返回 null 表示网络失败, 或连接关闭, 否则表示成功, 类型为 Buffer
  async gets(maxSize: number = 0): Promise<Buffer | null> {
    return this.readDelimiter("\n", maxSize)
  }

  // 写 Buffer
  // 返回值是 boolean 类型, 返回 false 表示网络错误,或连接关闭,返回 true 表示成功
  async writeBuffer(buf: Buffer, flush?: boolean) {
    let that = this
    that.onExtraDataReadableTrueDoFlag = true
    if (this.errorFlag || this.closeFlag) {
      return false
    }
    this.writeCaches.push(buf)
    let nowLength = 0
    this.writeCaches.forEach((b) => {
      nowLength += b.length
    })
    if ((!flush) && (nowLength < 4096)) {
      return true
    }
    return this.flush()
  }

  // 写 string
  // 返回值是 boolean 类型, 返回 false 表示网络错误,或连接关闭,返回 true 表示成功
  async write(str: string, flush?: boolean) {
    return this.writeBuffer(Buffer.from(str), flush)
  }

  // socket 关闭,错误后, 已经发起的未处理完毕的读写 resolve
  private _systemResolveStrike(v: any) {
    if (!this.systemResolve) {
      return
    }
    let resolve = this.systemResolve
    this.systemResolve = null
    resolve(v)
  }

  // 刷写缓存
  // 返回值是 boolean 类型, 返回 false 表示网络错误,或连接关闭,返回 true 表示成功
  async flush() {
    let newBuf = Buffer.concat(this.writeCaches)
    this.writeCaches = []
    if (newBuf.length == 0) {
      return true
    }

    return new Promise((resolve: { (ret: boolean): void }) => {
      this.systemResolve = resolve
      if (this.socket.write(newBuf), () => {
        this._systemResolveStrike(true)
      }) {
        this._systemResolveStrike(true)
      }
    })
  }

  // 关闭连接
  // 关闭后, 此对象就不能再次使用了
  close() {
    this.socket.end()
    this.closeFlag = true
  }

  //
  isError() {
    return this.errorFlag
  }

  //
  isTimeout() {
    return this.timeoutFlag
  }

  //
  isClosed() {
    return this.closeFlag
  }
}
