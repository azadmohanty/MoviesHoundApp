package com.hologram.downloader.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val HoloDownDarkColorScheme = darkColorScheme(
    primary = ElectricIndigo,
    onPrimary = TextPrimary,
    primaryContainer = ElectricIndigoDark,
    onPrimaryContainer = TextPrimary,
    secondary = EmeraldGreen,
    onSecondary = TextPrimary,
    background = DeepVoid,
    onBackground = TextPrimary,
    surface = DarkSlateGlass,
    onSurface = TextPrimary,
    surfaceVariant = DarkSlateElevated,
    onSurfaceVariant = TextSecondary,
    outline = SubtleBorder,
    outlineVariant = SubtleSlate,
    error = CrimsonError,
    onError = TextPrimary
)

@Composable
fun HoloDownTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = HoloDownDarkColorScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            window?.let {
                it.statusBarColor = DeepVoid.toArgb()
                it.navigationBarColor = DarkSlateGlass.toArgb()
                val insetsController = WindowCompat.getInsetsController(it, view)
                insetsController.isAppearanceLightStatusBars = false
                insetsController.isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
