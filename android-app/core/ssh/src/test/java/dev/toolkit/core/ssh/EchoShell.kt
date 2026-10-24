package dev.toolkit.core.ssh

import org.apache.sshd.server.channel.ChannelSession
import org.apache.sshd.server.session.ServerSession
import org.apache.sshd.server.shell.InvertedShell
import java.io.InputStream
import java.io.OutputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream

/** MINA 测试用最小回显 shell：读到一行输入就回一行 ECHO:<line>。 */
class EchoShell : InvertedShell {
    private val stdinPipe = PipedInputStream(8192)
    private val stdinSink = PipedOutputStream(stdinPipe)
    private val stdoutPipe = PipedInputStream(8192)
    private val stdoutSink = PipedOutputStream(stdoutPipe)
    private val errPipe = PipedInputStream(1024)
    private val errSink = PipedOutputStream(errPipe)
    @Volatile private var alive = true
    private var worker: Thread? = null

    override fun getInputStream(): OutputStream = stdinSink
    override fun getOutputStream(): InputStream = stdoutPipe
    override fun getErrorStream(): InputStream = errPipe
    override fun isAlive(): Boolean = alive
    override fun exitValue(): Int = 0
    override fun setSession(session: ServerSession?) = Unit
    override fun getServerSession(): ServerSession? = null
    override fun getServerChannelSession(): ChannelSession? = null

    override fun start(channel: ChannelSession?, env: org.apache.sshd.server.Environment?) {
        worker = Thread {
            val reader = stdinPipe.bufferedReader()
            try {
                while (true) {
                    val line = reader.readLine() ?: break
                    val out = "ECHO:$line\n".toByteArray()
                    synchronized(stdoutSink) { stdoutSink.write(out); stdoutSink.flush() }
                }
            } catch (_: Exception) {
            } finally {
                alive = false
            }
        }.apply { isDaemon = true; start() }
    }

    override fun destroy(channel: ChannelSession?) {
        alive = false
        runCatching { stdinSink.close() }
        runCatching { stdoutSink.close() }
        runCatching { errSink.close() }
    }
}
