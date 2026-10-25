import 'package:flutter/material.dart';

import '../tema.dart';

class ResultadoAcessoTela extends StatelessWidget {
  final bool liberado;
  final VoidCallback onVoltar;

  const ResultadoAcessoTela({
    super.key,
    required this.liberado,
    required this.onVoltar,
  });

  @override
  Widget build(BuildContext context) {
    final cor = liberado ? Cores.ok : Cores.erro;

    return SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 120,
                  height: 120,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: cor, shape: BoxShape.circle),
                  child: Text(
                    liberado ? '\u2713' : '\u2717',
                    style: const TextStyle(fontSize: 64, color: Colors.white),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                liberado ? 'Acesso liberado' : 'Acesso negado',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: cor,
                ),
              ),
              const SizedBox(height: 8),
              if (liberado)
                const Text(
                  'Pode passar pela catraca.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: Cores.mudo),
                )
              else ...[
                const Text(
                  'Autorização inválida, expirada, cancelada ou não autorizada.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: Cores.mudo),
                ),
                const SizedBox(height: 4),
                const Text(
                  'A tentativa foi registrada.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: Cores.mudo),
                ),
              ],
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: onVoltar,
                style: liberado
                    ? null
                    : ElevatedButton.styleFrom(backgroundColor: Cores.erro),
                child: const Text('Voltar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
