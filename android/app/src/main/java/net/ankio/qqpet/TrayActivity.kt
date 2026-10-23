package net.ankio.qqpet

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Notification taps land here and are passed on to PetService. An activity, unlike a service PendingIntent, closes
 * the notification shade, so the menu or the pet the tap asks for is not drawn behind it.
 */
class TrayActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        intent?.action?.let { startService(Intent(this, PetService::class.java).setAction(it)) }
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }
}
