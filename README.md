# node-socket-sync-buffer

同步操作socket， 基于 promise， 见例子 examples

网址: https://github.com/mailhonor/node-socket-sync-buffer

## 基本用法 
```ts
npm i socket-sync-buffer
```

### 创建对象
```ts
const socketSyncBuffer = require("socket-sync-buffer").socketSyncBuffer

// host: string, 地址
// port: number, 端口
// ssl?: boolean, 是否开启ssl
// timeout?: number, 读写超时(毫秒)
// rejectUnauthorized?: boolean, 如果证书有问题是否拒绝连接
let socket = new socketSyncBuffer({ host: "127.0.0.1", port: 465, ssl: false, timeout: 0 })
```

### 连接

返回值是 boolean 类型, 返回 false 表示连接失败, 返回 true 表示成功

```ts
let res = await socket.connect()
```

### 读数据

返回 null 表示网络失败, 或连接关闭, 否则表示成功, 类型为 Buffer

```ts
// 读一行, 
let res = await socket.gets()
let res = await socket.readDelimiter("\n")

// 读到指定字符(长度为 1 的字节)
// 最多读取 maxSize个字符， maxSize为 0 表示不限制 
let res = await socket.readDelimiter(delimiter: string, maxSize: number = 0)

// 读指定长度的数据
let res = await socket.readn(size: number)

// 读数据, 数据长度不定
let res = await socket.read()
```

### 写数据

返回值是 boolean 类型, 返回 false 表示网络错误,或连接关闭,返回 true 表示成功

```ts
// 写 string
let res = await socket.write(str: string)
// 写 Buffer
let res = await socket.writeBuffer(buf: Buffer)
// flush 写缓存
let res = await socket.flush()
```

### 发起 ssl 连接

返回值是 boolean 类型, 返回 false 表示网络错误,或连接关闭,返回 true 表示成功

```
let res = await socket.tlsConnect()
```

### 属性

返回值是 boolean 类型

```ts
// 是否出错, 一般指的是网络错误
let res = socket.isError()
// 是否超时错误
let res = socket.isTimeout()
// 是否连接关闭
let res = socket.isClosed()
```

### 其他可读

```ts
// 是否有真实数据可读
await trueDataReadable()
```

有的时候服务会主动返回数据, 用下面这个方法检测

执行一次, 只生效一次, 可读或出错的时候执行 handler, 

如果 handler 为 undefined, 则使用上一次的 handler

```ts
void setOnExtraDataReadableHandlerOnce(handler: (() => any) | undefined)
```
