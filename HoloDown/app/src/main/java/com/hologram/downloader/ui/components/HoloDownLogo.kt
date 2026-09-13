package com.hologram.downloader.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.hologram.downloader.ui.theme.ElectricIndigoLight

/**
 * 8-Bit Pixel Mascot Logo matching the HoloDown Cyberpunk Icon
 */
@Composable
fun HoloDownLogo(
    modifier: Modifier = Modifier,
    size: Dp = 34.dp,
    tint: Color = ElectricIndigoLight
) {
    // 14 columns x 16 rows binary bitmap
    val pixelMap = listOf(
        "00100000000100", // Row 0
        "01100000000110", // Row 1
        "00001000010000", // Row 2 (antennae)
        "00000111100000", // Row 3
        "00001111110000", // Row 4
        "00011011011000", // Row 5 (eyes)
        "00111111111100", // Row 6
        "01101111110110", // Row 7
        "01101000010110", // Row 8
        "00001000010000", // Row 9
        "00010000001000", // Row 10
        "00100000000100", // Row 11
        "01110000001110", // Row 12 (crosses top)
        "11111000011111", // Row 13 (crosses mid)
        "01110000001110"  // Row 14 (crosses bot)
    )

    Canvas(modifier = modifier.size(size)) {
        val cols = 14
        val rows = pixelMap.size
        val pixelWidth = this.size.width / cols
        val pixelHeight = this.size.height / rows
        val pixelSize = minOf(pixelWidth, pixelHeight)

        val offsetX = (this.size.width - (cols * pixelSize)) / 2f
        val offsetY = (this.size.height - (rows * pixelSize)) / 2f

        for (r in 0 until rows) {
            val rowStr = pixelMap[r]
            for (c in 0 until cols) {
                if (c < rowStr.length && rowStr[c] == '1') {
                    drawRect(
                        color = tint,
                        topLeft = Offset(offsetX + c * pixelSize, offsetY + r * pixelSize),
                        size = Size(pixelSize, pixelSize)
                    )
                }
            }
        }
    }
}
