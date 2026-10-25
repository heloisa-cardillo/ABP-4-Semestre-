import 'package:flutter/material.dart';

import '../tema.dart';

class LerQrTela extends StatelessWidget {
  const LerQrTela({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: Cores.azul,
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
          child: const SafeArea(
            bottom: false,
            child: Text(
              'Ler QR Code',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Container(
              width: double.infinity,
              height: 330,
              decoration: BoxDecoration(
                color: const Color(0xFF0B1D36),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: 190,
                    height: 190,
                    decoration: BoxDecoration(
                      border: Border.all(color: Cores.azul3, width: 4),
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  const Positioned(
                    bottom: 12,
                    child: Text(
                      'Aponte para o QR Code do terminal',
                      style: TextStyle(fontSize: 14, color: Color(0xFFCFE1FB)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
