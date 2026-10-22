package net.ankio.qqpet

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.Icon
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.view.WindowManager.LayoutParams
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.FrameLayout
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

/**
 * Hosts the pet page in an overlay window. The WebView keeps the screen's size
 * and is shifted inside a window cut down to the rectangle the page reports
 * (bridge.ts), so touches elsewhere reach the apps below.
 */
class PetService : Service() {
    companion object {
        /** The running service, for GameActivity to report play time. */
        var instance: PetService? = null
            private set

        private const val NOTIFICATION_ID = 1
        /** A window move this far (px) is hidden until the page is drawn at the new origin. */
        private const val JUMP_PX = 4
        private const val REVEAL_MS = 200L
        private const val TRAY_ICON_PX = 96
    }

    private lateinit var wm: WindowManager
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private val net = Executors.newCachedThreadPool()
    private val prefs by lazy { getSharedPreferences("qqpet", MODE_PRIVATE) }

    private val params = LayoutParams(
        1, 1, LayoutParams.TYPE_APPLICATION_OVERLAY,
        LayoutParams.FLAG_NOT_FOCUSABLE or LayoutParams.FLAG_NOT_TOUCH_MODAL or LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
            LayoutParams.FLAG_LAYOUT_IN_SCREEN or LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        layoutInDisplayCutoutMode = LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        fitInsetsTypes = 0
        // The system slides a window to its new origin over a few frames, while the page is already shifted by the
        // whole move: shrinking the window from the left (the menu closing) showed the pet far left, sliding back.
        // PRIVATE_FLAG_NO_MOVE_ANIMATION makes the move instant; hidden API, so a failure just keeps the slide.
        try {
            val f = LayoutParams::class.java.getField("privateFlags")
            f.setInt(this, f.getInt(this) or 0x40)
        } catch (e: Throwable) {
            Log.w("QQPet", "no-move-animation flag unavailable", e)
        }
    }

    private lateinit var probe: View
    private val probeParams = LayoutParams(
        1, 1, LayoutParams.TYPE_APPLICATION_OVERLAY,
        LayoutParams.FLAG_NOT_FOCUSABLE or LayoutParams.FLAG_NOT_TOUCHABLE or LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START }

    override fun onBind(intent: Intent?) = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate() {
        super.onCreate()
        instance = this
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("pet", "QQ宠物", NotificationManager.IMPORTANCE_LOW))
        startForeground(NOTIFICATION_ID, notification())
        wm = getSystemService(WindowManager::class.java)
        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
        web = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.useWideViewPort = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = AssetClient(this@PetService) { hd() }
            addJavascriptInterface(Bridge(), "QQPetNative")
        }
        root = object : FrameLayout(this) {
            override fun dispatchTouchEvent(e: MotionEvent): Boolean {
                if (e.actionMasked != MotionEvent.ACTION_OUTSIDE) return super.dispatchTouchEvent(e)
                emit("outside", "undefined")
                return true
            }

            // A focusable overlay takes the back key from the app below; give it back.
            override fun dispatchKeyEvent(e: KeyEvent): Boolean {
                if (e.keyCode != KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(e)
                setFocusable(false)
                return true
            }
        }
        root.addView(web, screenSize())
        // The system may place the window elsewhere than asked (e.g. clear of the status bar),
        // so the page is shifted by where the window really is, in the same frame it moved.
        val at = IntArray(2)
        root.viewTreeObserver.addOnPreDrawListener {
            root.getLocationOnScreen(at)
            if (web.translationX != -at[0].toFloat()) web.translationX = -at[0].toFloat()
            if (web.translationY != -at[1].toFloat()) web.translationY = -at[1].toFloat()
            reveal?.let { if (it[0] == at[0] && it[1] == at[1]) { reveal = null; web.alpha = 1f } }
            true
        }
        wm.addView(root, params)
        // A hidden window gets no insets, so a separate always-shown pixel watches the status bar.
        probe = View(this)
        probe.setOnApplyWindowInsetsListener { _, insets ->
            fullscreen = !insets.isVisible(WindowInsets.Type.statusBars())
            applyShown()
            insets
        }
        wm.addView(probe, probeParams)
        web.loadUrl("$ORIGIN/index.html")
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, filter, RECEIVER_NOT_EXPORTED)
        else @Suppress("UnspecifiedRegisterReceiverFlag") registerReceiver(screen, filter)
    }

    private var gone = false

    private fun presence(on: Boolean) {
        if (on == gone) return
        gone = on
        emit("presence", if (on) "true" else "false")
    }

    private val screen = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                Intent.ACTION_SCREEN_OFF -> presence(true)
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> presence(false)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "state", "menu", "show", "hide" -> emit("trayClick", JSONObject().put("kind", intent.action).toString())
            "quit" -> stopSelf()
        }
        return START_STICKY
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        web.layoutParams = screenSize()
    }

    override fun onDestroy() {
        instance = null
        unregisterReceiver(screen)
        wm.removeView(root)
        wm.removeView(probe)
        web.destroy()
        net.shutdownNow()
        super.onDestroy()
    }

    private fun screenSize(): FrameLayout.LayoutParams {
        val b = wm.maximumWindowMetrics.bounds
        return FrameLayout.LayoutParams(b.width(), b.height())
    }

    private fun hd(): Boolean = try {
        JSONObject(File(filesDir, "save.json").readText()).getJSONObject("settings").optBoolean("hd")
    } catch (_: Exception) {
        // No save yet, or a corrupt one the page is about to replace.
        false
    }

    /** The tray state the page last set: its icon, or the app's own until then, and its tooltip. */
    private var trayIcon: Icon? = null
    private var trayTip = "点按查看宠物状态"

    private fun setTray(icon: String, tip: String?) {
        val path = "pet/img_res/Tray/$icon"
        val bitmap = try {
            assets.open(path.replace(".png", "@2x.png"))
        } catch (_: FileNotFoundException) {
            assets.open(path)
        }.use { BitmapFactory.decodeStream(it) }
        // Pixel art: scale without smoothing. The status bar draws it as a silhouette, the shade in colour.
        trayIcon = Icon.createWithBitmap(Bitmap.createScaledBitmap(bitmap, TRAY_ICON_PX, TRAY_ICON_PX, false))
        if (tip != null) trayTip = tip
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification())
    }

    /** The page hid the pet (菜单 隐藏宠物); the notification then offers to show it again. */
    private var petHidden = false

    private fun setHidden(on: Boolean) {
        if (on == petHidden) return
        petHidden = on
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification())
    }

    private fun notification(): Notification {
        // Through TrayActivity, which closes the shade; quitting needs no shade closed.
        fun tap(name: String) = PendingIntent.getActivity(
            this, name.hashCode(),
            Intent(this, TrayActivity::class.java).setAction(name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        fun action(name: String) = PendingIntent.getService(this, name.hashCode(), Intent(this, PetService::class.java).setAction(name), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, "pet")
            .setSmallIcon(trayIcon ?: Icon.createWithResource(this, R.drawable.ic_notification))
            .setLargeIcon(trayIcon)
            .setContentTitle("QQ宠物")
            .setContentText(if (petHidden) "宠物隐藏中，点按显示" else trayTip)
            // A hidden pet has nothing to tap: the notification is the way back.
            .setContentIntent(tap(if (petHidden) "show" else "state"))
            .addAction(Notification.Action.Builder(null, if (petHidden) "显示宠物" else "隐藏宠物", tap(if (petHidden) "show" else "hide")).build())
            .addAction(Notification.Action.Builder(null, "菜单", tap("menu")).build())
            .addAction(Notification.Action.Builder(null, "退出", action("quit")).build())
            .setOngoing(true)
            .build()
    }

    /** Calls `__qqpet.emit(type, payload)`; [payload] is a JS expression. */
    fun emit(type: String, payload: String) = web.post { web.evaluateJavascript("__qqpet.emit('$type', $payload)", null) }

    private fun resolve(id: Int, value: String?, error: String? = null) = web.post {
        web.evaluateJavascript("__qqpet.resolve($id, ${quote(value)}, ${quote(error)})", null)
    }

    private fun quote(s: String?) = if (s == null) "null" else JSONObject.quote(s)

    private fun setFocusable(on: Boolean) {
        params.flags = if (on) params.flags and LayoutParams.FLAG_NOT_FOCUSABLE.inv() else params.flags or LayoutParams.FLAG_NOT_FOCUSABLE
        wm.updateViewLayout(root, params)
    }

    /** Moves the window onto CSS rectangle (x, y, w, h) of the page, keeping the page in place on screen. */
    private fun setBounds(x: Double, y: Double, w: Double, h: Double, viewport: Double) {
        val scale = web.layoutParams.width / viewport
        val nx = floor(x * scale).toInt()
        val ny = floor(y * scale).toInt()
        val touchable = w != 0.0 && h != 0.0
        val to = intArrayOf(nx, ny, maxOf(ceil(w * scale).toInt(), 1), maxOf(ceil(h * scale).toInt(), 1), if (touchable) 1 else 0)
        // Until the app draws again the system shows the window's last frame at its new origin, so a far move showed
        // the pet at a wrong place for a frame (#18: drag start and end, menus). The page itself is made transparent
        // and drawn so first (no relayout, unlike the window alpha that blanked it for half a second), then the window
        // moves, and the pre-draw listener shows the page again once the window really is there.
        val far = abs(nx - params.x) > JUMP_PX || abs(ny - params.y) > JUMP_PX
        if (target != null || far && web.alpha != 0f) {
            val first = target == null
            target = to
            if (first) {
                web.alpha = 0f
                root.viewTreeObserver.registerFrameCommitCallback { web.post { target?.let { target = null; place(it, true) } } }
                web.invalidate()
            }
            return
        }
        place(to, false)
    }

    /** Window origin awaiting the transparent frame; null when none. */
    private var target: IntArray? = null
    /** The origin the hidden page is shown again at. */
    private var reveal: IntArray? = null

    private fun place(to: IntArray, hidden: Boolean) {
        web.translationX = -to[0].toFloat()
        web.translationY = -to[1].toFloat()
        params.x = to[0]
        params.y = to[1]
        params.width = to[2]
        params.height = to[3]
        params.flags = if (to[4] == 0) params.flags or LayoutParams.FLAG_NOT_TOUCHABLE else params.flags and LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        wm.updateViewLayout(root, params)
        if (hidden) {
            reveal = intArrayOf(to[0], to[1])
            // The system may keep the window elsewhere than asked (pre-draw listener); never leave the pet hidden.
            web.postDelayed({ if (reveal != null && target == null) { reveal = null; web.alpha = 1f } }, REVEAL_MS)
        }
        // Chromium rasters only the visible rect; without this, static content uncovered by a bigger window stays blank.
        web.invalidate()
    }

    private fun http(id: Int, method: String, url: String, headers: String, body: String?) = net.execute {
        try {
            val c = URL(url).openConnection() as HttpURLConnection
            c.requestMethod = method
            c.connectTimeout = 60_000
            c.readTimeout = 60_000
            val h = JSONObject(headers)
            for (k in h.keys()) c.setRequestProperty(k, h.getString(k))
            if (body != null) {
                c.doOutput = true
                c.outputStream.use { it.write(body.toByteArray()) }
            }
            val text = (if (c.responseCode < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            resolve(id, JSONObject().put("status", c.responseCode).put("body", text).toString())
        } catch (e: Exception) {
            // Runs on a pool thread: anything uncaught here kills the app.
            resolve(id, null, e.toString())
        }
    }

    /** One of ours (a file picker, a game) is in front. */
    private var away = false

    /** The app in front hides the status bar. */
    private var fullscreen = false

    /** The overlay stays above every app; it steps aside while [away] or [fullscreen]. */
    private fun applyShown() {
        root.visibility = if (away || fullscreen) View.GONE else View.VISIBLE
    }

    fun setShown(on: Boolean) = web.post {
        away = !on
        applyShown()
    }

    private fun pickFile(intent: Intent, done: (Uri?) -> Unit) {
        setShown(false)
        FileActivity.done = { uri ->
            setShown(true)
            done(uri)
        }
        startActivity(Intent(this, FileActivity::class.java).putExtra(Intent.EXTRA_INTENT, intent).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** window.QQPetNative; see the Native interface in src/android/bridge.ts. Called on a WebView thread. */
    private inner class Bridge {
        @JavascriptInterface
        fun rotatableScreen(): Boolean {
            val portrait = packageManager.hasSystemFeature(PackageManager.FEATURE_SCREEN_PORTRAIT)
            val landscape = packageManager.hasSystemFeature(PackageManager.FEATURE_SCREEN_LANDSCAPE)
            // Android's compatibility rule also allows both when neither feature is declared.
            return portrait == landscape
        }

        @JavascriptInterface
        fun read(name: String): String? = File(filesDir, name).takeIf { it.exists() }?.readText()

        @JavascriptInterface
        fun write(name: String, text: String) {
            val tmp = File(filesDir, "$name.tmp")
            tmp.writeText(text)
            tmp.renameTo(File(filesDir, name))
        }

        @JavascriptInterface
        fun http(id: Int, method: String, url: String, headers: String, body: String?) = this@PetService.http(id, method, url, headers, body)

        @JavascriptInterface
        fun exportSave(id: Int, name: String, text: String) {
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, name)
            pickFile(intent) { uri ->
                try {
                    if (uri != null) contentResolver.openOutputStream(uri, "wt")!!.use { it.write(text.toByteArray()) }
                    resolve(id, uri?.let { "true" })
                } catch (e: Exception) {
                    resolve(id, null, e.toString())
                }
            }
        }

        @JavascriptInterface
        fun importSave(id: Int) {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            pickFile(intent) { uri ->
                try {
                    resolve(id, uri?.let { u -> contentResolver.openInputStream(u)!!.bufferedReader().use { it.readText() } })
                } catch (e: Exception) {
                    resolve(id, null, e.toString())
                }
            }
        }

        @JavascriptInterface
        fun openGame(swf: String) = startActivity(Intent(this@PetService, GameActivity::class.java).putExtra("swf", swf).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

        @JavascriptInterface
        fun quit() = stopSelf()

        @JavascriptInterface
        fun copyText(text: String) = getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("QQ宠物", text))

        @JavascriptInterface
        fun openUrl(url: String) = startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

        @JavascriptInterface
        fun setFocusable(on: Boolean) = web.post { this@PetService.setFocusable(on) }

        @JavascriptInterface
        fun setAutoStart(on: Boolean) = prefs.edit().putBoolean("autoStart", on).apply()

        @JavascriptInterface
        fun setTray(icon: String, tip: String?) = web.post { this@PetService.setTray(icon, tip) }

        @JavascriptInterface
        fun setHidden(on: Boolean) = web.post { this@PetService.setHidden(on) }

        @JavascriptInterface
        fun setBounds(x: Double, y: Double, w: Double, h: Double, viewport: Double) = web.post { this@PetService.setBounds(x, y, w, h, viewport) }

        /** "left,top,right,bottom" of the system bars and cutout, in CSS pixels of a page [viewport] pixels wide. Hidden bars count: a swipe brings them back. */
        @JavascriptInterface
        fun safeArea(viewport: Double): String {
            val m = wm.maximumWindowMetrics
            val i = m.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val scale = m.bounds.width() / viewport
            return listOf(i.left, i.top, i.right, i.bottom).joinToString(",") { "${it / scale}" }
        }
    }
}
