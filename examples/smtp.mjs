import { socketSyncBuffer } from "../dist/index.mjs"

let argv = process.argv

function showUsage() {
    console.log(argv[0], argv[1], "smtp_host port [ SSL / STARTTLS ]")
    console.log("EXAMPLES:")
    console.log(argv[0], argv[1], "127.0.0.1 25")
    console.log(argv[0], argv[1], "127.0.0.1 25 STARTTLS")
    console.log(argv[0], argv[1], "127.0.0.1 465 SSL")
    process.exit(1)
}

async function do_test_cmd_ehlo(socket) {
    console.log("")
    if (! await socket.write("ehlo xxx\r\n")) {
        console.log("send ehlo xxx, error")
        return false
    }
    console.log("send ehlo xxx, success")

    while (1) {
        let res = await socket.gets()
        if (res === null) {
            console.log("recv ehlo, error")
            return false
        }
        console.log("recv ehlo: ", res.toString().trim())
        if (res.toString()[0] != "2") {
            break
        }
        if (res.toString().startsWith("250 ")) {
            break
        }
    }

    return true
}

async function do_test_cmd_STARTTLS(socket) {
    console.log("")
    if (!await socket.write("STARTTLS\r\n")) {
        console.log("send STARTTLS, error")
        return false
    }
    let res = await socket.gets()
    if ((res === null) || (res.length < 1)) {
        console.log("recv STARTTLS response, error")
        return false
    } else {
        let s = res.toString()
        if (s[0] != "2" && s[0] != "3") {
            console.log("recv STARTTLS: ", s)
        } else {
            if (! await socket.tlsConnect()) {
                console.log("STARTTLS handshake, error")
                return false
            }
            console.log("STARTTLS handshake, success")
        }
    }
    return true
}

async function do_test(attrs) {
    let socket = new socketSyncBuffer({ host: attrs.host, port: attrs.port, ssl: attrs.ssl, timeout: 10000 })

    if (! await socket.connect()) {
        console.log("connect", attrs.host + ":" + attrs.port + ", error")
        return
    }

    console.log("")
    let res = await socket.gets()
    if (res === null) {
        console.log("recv welcome, error")
        return
    }
    console.log("recv welcome: ", res.toString().trim())

    if (! await do_test_cmd_ehlo(socket)) {
        return
    }

    if (argv[4] === "STARTTLS" && attrs.ssl !== true) {
        if (! await do_test_cmd_STARTTLS(socket)) {
            return
        }
        if (! await do_test_cmd_ehlo(socket)) {
            return
        }
    }

    console.log("")
    if (!await socket.write("quit\r\n")) {
        console.log("send quit, error")
        return
    }
    console.log("send quit, success")
    if ((res = await socket.gets()) === null) {
        console.log("recv quit, error")
        return
    }
    console.log("recv quit, success")

    console.log("")
    console.log("status, closed: ", socket.isClosed())
    console.log("status, error: ", socket.isError())

    console.log("")
    console.log("smtp 协议完成了, 一般情况,服务器已经关闭了连接")
    console.log("再次读一次, 则应该返回错误")
    if ((res = await socket.gets()) === null) {
        console.log("recv, error")
    }
    console.log("")
    console.log("status, closed: ", socket.isClosed())
    console.log("status, error: ", socket.isError())
}

if (argv.length < 4) {
    showUsage()
}

do_test({ host: argv[2], port: parseInt(argv[3]), ssl: (argv[4] === "SSL") }).then((a) => {
    console.log("\ntest over\n")
})

