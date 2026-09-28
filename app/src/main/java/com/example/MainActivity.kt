package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.engine.ComVisionEngine
import com.example.ui.MainApp
import com.example.ui.theme.ComVisionTheme

class MainActivity : ComponentActivity() {
    private val engine by lazy { ComVisionEngine() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ComVisionTheme {
                MainApp(engine = engine)
            }
        }
    }
}
