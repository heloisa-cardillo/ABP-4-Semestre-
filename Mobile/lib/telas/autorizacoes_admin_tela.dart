import 'package:flutter/material.dart';

import '../tema.dart';

enum Situacao { ativa, expirada, cancelada }

class _Autorizacao {
  final String pessoa;
  final String local;
  final String periodo;
  Situacao situacao;

  _Autorizacao({
    required this.pessoa,
    required this.local,
    required this.periodo,
    this.situacao = Situacao.ativa,
  });
}

class AutorizacoesAdminTela extends StatefulWidget {
  const AutorizacoesAdminTela({super.key});

  @override
  State<AutorizacoesAdminTela> createState() => _AutorizacoesAdminTelaState();
}

class _AutorizacoesAdminTelaState extends State<AutorizacoesAdminTela> {
  final List<_Autorizacao> _autorizacoes = [];
  Situacao? _filtro;
  String _busca = '';

  List<_Autorizacao> get _filtradas {
    return _autorizacoes.where((a) {
      final okSituacao = _filtro == null || a.situacao == _filtro;
      final okBusca = _busca.isEmpty || a.pessoa.toLowerCase().contains(_busca);
      return okSituacao && okBusca;
    }).toList();
  }

  Widget _rotulo(String texto) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        texto,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.bold,
          color: Cores.azul,
        ),
      ),
    );
  }

  Widget _tag(Situacao situacao) {
    final Color fundo;
    final Color cor;
    final String texto;

    switch (situacao) {
      case Situacao.ativa:
        fundo = Cores.okFundo;
        cor = Cores.ok;
        texto = 'Ativa';
      case Situacao.expirada:
        fundo = Cores.claro;
        cor = Cores.mudo;
        texto = 'Expirada';
      case Situacao.cancelada:
        fundo = Cores.erroFundo;
        cor = Cores.erro;
        texto = 'Cancelada';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: fundo,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        texto,
        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: cor),
      ),
    );
  }

  Widget _card(_Autorizacao a) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Cores.borda, width: 2),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _tag(a.situacao),
          const SizedBox(height: 8),
          Text(
            a.pessoa,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              color: Cores.azul,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            a.local,
            style: const TextStyle(fontSize: 14, color: Cores.mudo),
          ),
          const SizedBox(height: 2),
          Text(
            a.periodo,
            style: const TextStyle(fontSize: 14, color: Cores.mudo),
          ),
          if (a.situacao == Situacao.ativa) ...[
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => setState(() => a.situacao = Situacao.cancelada),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(44),
                textStyle: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
              child: const Text('Cancelar autorização'),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lista = _filtradas;

    return Column(
      children: [
        Container(
          width: double.infinity,
          color: Cores.azul,
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
          child: const SafeArea(
            bottom: false,
            child: Text(
              'Autorizações',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _rotulo('Situação'),
                        DropdownButtonFormField<Situacao?>(
                          initialValue: null,
                          isExpanded: true,
                          items: const [
                            DropdownMenuItem(value: null, child: Text('Todas')),
                            DropdownMenuItem(
                              value: Situacao.ativa,
                              child: Text('Ativas'),
                            ),
                            DropdownMenuItem(
                              value: Situacao.expirada,
                              child: Text('Expiradas'),
                            ),
                            DropdownMenuItem(
                              value: Situacao.cancelada,
                              child: Text('Canceladas'),
                            ),
                          ],
                          onChanged: (v) => setState(() => _filtro = v),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _rotulo('Pessoa'),
                        TextField(
                          decoration: const InputDecoration(hintText: 'Buscar'),
                          onChanged: (v) =>
                              setState(() => _busca = v.toLowerCase()),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (lista.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 40),
                  child: Center(
                    child: Text(
                      'Nenhum registro',
                      style: TextStyle(fontSize: 16, color: Cores.mudo),
                    ),
                  ),
                )
              else
                ...lista.map(_card),
            ],
          ),
        ),
      ],
    );
  }
}
