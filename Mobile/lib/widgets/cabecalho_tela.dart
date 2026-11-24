import 'package:flutter/material.dart';

import '../tema.dart';

/// Cabeçalho azul com título à esquerda e botão "Sair" no canto superior direito.
class CabecalhoTela extends StatelessWidget {
  final String titulo;
  final VoidCallback onLogout;

  const CabecalhoTela({
    super.key,
    required this.titulo,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Cores.azul,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            Expanded(
              child: Text(
                titulo,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
            TextButton.icon(
              onPressed: onLogout,
              icon: const Icon(Icons.logout, color: Colors.white, size: 20),
              label: const Text(
                'Sair',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}