import 'package:flutter/material.dart';

import '../tema.dart';

class HistoricoTela extends StatelessWidget {
  const HistoricoTela({super.key});

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
              'Histórico de acessos',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ),
        const Expanded(
          child: Center(
            child: Text(
              'Nenhum registro',
              style: TextStyle(fontSize: 16, color: Cores.mudo),
            ),
          ),
        ),
      ],
    );
  }
}
