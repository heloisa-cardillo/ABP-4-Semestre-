import 'package:flutter/material.dart';

class Cores {
  static const azul = Color(0xFF043873);
  static const azul2 = Color(0xFF2F6FD0);
  static const azul3 = Color(0xFF4F9CF9);
  static const claro = Color(0xFFE8F1FD);
  static const borda = Color(0xFFC9D9F0);
  static const texto = Color(0xFF12233F);
  static const mudo = Color(0xFF5B6B85);
  static const ok = Color(0xFF1D7A46);
  static const okFundo = Color(0xFFE1F4E9);
  static const erro = Color(0xFFB3261E);
  static const erroFundo = Color(0xFFFBE5E3);
}

ThemeData temaApp() {
  final borda = OutlineInputBorder(
    borderRadius: BorderRadius.circular(10),
    borderSide: const BorderSide(color: Cores.borda, width: 2),
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: Cores.azul2,
      primary: Cores.azul2,
    ),
    scaffoldBackgroundColor: Colors.white,
    appBarTheme: const AppBarTheme(
      backgroundColor: Cores.azul,
      foregroundColor: Colors.white,
      titleTextStyle: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.bold,
        color: Colors.white,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: Cores.azul2,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(54),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Cores.azul,
        backgroundColor: Cores.claro,
        minimumSize: const Size.fromHeight(54),
        side: const BorderSide(color: Cores.azul2, width: 2),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: borda,
      enabledBorder: borda,
      focusedBorder: borda.copyWith(
        borderSide: const BorderSide(color: Cores.azul2, width: 2),
      ),
      contentPadding: const EdgeInsets.all(14),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: Cores.claro,
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
      ),
    ),
  );
}
