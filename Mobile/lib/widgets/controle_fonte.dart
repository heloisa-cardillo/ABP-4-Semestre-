import 'package:flutter/material.dart';

import '../services/acessibilidade_service.dart';

class ControleFonte extends StatelessWidget {
  final AcessibilidadeService servico;

  const ControleFonte({super.key, required this.servico});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: servico,
      builder: (context, _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: 'Diminuir fonte',
            onPressed: servico.podeDiminuir ? servico.diminuir : null,
            icon: const Icon(Icons.text_decrease),
          ),
          IconButton(
            tooltip: 'Aumentar fonte',
            onPressed: servico.podeAumentar ? servico.aumentar : null,
            icon: const Icon(Icons.text_increase),
          ),
        ],
      ),
    );
  }
}