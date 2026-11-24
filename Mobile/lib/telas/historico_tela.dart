import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../tema.dart';
import '../widgets/cabecalho_tela.dart';

class HistoricoTela extends StatelessWidget {
  final ApiService apiService;
  final VoidCallback onLogout;

  const HistoricoTela({
    super.key,
    required this.apiService,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        CabecalhoTela(
          titulo: 'Histórico de acessos',
          onLogout: onLogout,
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