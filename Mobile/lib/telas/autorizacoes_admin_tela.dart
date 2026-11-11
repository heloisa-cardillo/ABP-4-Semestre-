import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../tema.dart';

const _rotulosTipo = {
  'BUILDING': 'Edifício',
  'GATEHOUSE': 'Portaria',
  'DOOR': 'Porta',
  'TURNSTILE': 'Catraca',
};

// Valor da API -> rótulo do filtro
const _situacoes = <String?, String>{
  null: 'Todas',
  'VALID': 'Válidas',
  'SCHEDULED': 'Agendadas',
  'EXPIRED': 'Expiradas',
  'EXHAUSTED': 'Esgotadas',
  'CANCELLED': 'Canceladas',
};

class AutorizacoesAdminTela extends StatefulWidget {
  final ApiService apiService;

  const AutorizacoesAdminTela({super.key, required this.apiService});

  @override
  State<AutorizacoesAdminTela> createState() => _AutorizacoesAdminTelaState();
}

class _AutorizacoesAdminTelaState extends State<AutorizacoesAdminTela> {
  List<Authorization> _autorizacoes = [];
  int _total = 0;
  bool _carregando = true;
  String? _erro;
  String? _filtro;
  String _busca = '';

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final pagina = await widget.apiService.listarAutorizacoes(
        situation: _filtro,
      );
      if (!mounted) return;
      setState(() {
        _autorizacoes = pagina.items;
        _total = pagina.total;
        _carregando = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _erro = e.message;
        _carregando = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _erro = 'Erro inesperado ao carregar as autorizações.';
        _carregando = false;
      });
    }
  }

  void _mensagem(String texto, {bool erro = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(texto),
          backgroundColor: erro ? Cores.erro : Cores.ok,
        ),
      );
  }

  Future<void> _cancelar(Authorization a) async {
    final motivo = await showDialog<String>(
      context: context,
      builder: (_) => const _DialogoCancelamento(),
    );
    if (motivo == null || !mounted) return;

    try {
      await widget.apiService.cancelarAutorizacao(a.id, motivo: motivo);
      if (!mounted) return;
      _mensagem('Autorização cancelada com sucesso.');
      _carregar();
    } on ApiException catch (e) {
      if (!mounted) return;
      _mensagem(e.message, erro: true);
    } catch (_) {
      if (!mounted) return;
      _mensagem('Erro inesperado. Tente novamente.', erro: true);
    }
  }

  List<Authorization> get _filtradas {
    if (_busca.isEmpty) return _autorizacoes;
    return _autorizacoes
        .where((a) => a.user.name.toLowerCase().contains(_busca))
        .toList();
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

  Widget _tag(Authorization a) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: a.situacaoFundo,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          a.situacaoTexto,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: a.situacaoCor,
          ),
        ),
      ),
    );
  }

  Widget _card(Authorization a) {
    final podeCancelar = a.situation == 'VALID' || a.situation == 'SCHEDULED';
    final tipo = _rotulosTipo[a.location.type] ?? a.location.type;
    final usos = a.maxUses == null
        ? 'Sem limite de usos'
        : 'Usos: ${a.usesCount} de ${a.maxUses}';

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
          _tag(a),
          const SizedBox(height: 8),
          Text(
            a.user.name,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              color: Cores.azul,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '$tipo • ${a.location.name}',
            style: const TextStyle(fontSize: 14, color: Cores.mudo),
          ),
          const SizedBox(height: 2),
          Text(
            a.periodoFormatado,
            style: const TextStyle(fontSize: 14, color: Cores.mudo),
          ),
          const SizedBox(height: 2),
          Text(usos, style: const TextStyle(fontSize: 14, color: Cores.mudo)),
          if (a.situation == 'CANCELLED' &&
              (a.cancelReason ?? '').isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              'Motivo: ${a.cancelReason}',
              style: const TextStyle(fontSize: 14, color: Cores.mudo),
            ),
          ],
          if (podeCancelar) ...[
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => _cancelar(a),
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

  List<Widget> _conteudo() {
    if (_carregando) {
      return const [
        Padding(
          padding: EdgeInsets.only(top: 40),
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
    }
    if (_erro != null) {
      return [
        Padding(
          padding: const EdgeInsets.only(top: 30),
          child: Column(
            children: [
              Text(
                _erro!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16, color: Cores.erro),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _carregar,
                child: const Text('Tentar novamente'),
              ),
            ],
          ),
        ),
      ];
    }

    final lista = _filtradas;
    if (lista.isEmpty) {
      return const [
        Padding(
          padding: EdgeInsets.only(top: 40),
          child: Center(
            child: Text(
              'Nenhum registro',
              style: TextStyle(fontSize: 16, color: Cores.mudo),
            ),
          ),
        ),
      ];
    }
    return [
      ...lista.map(_card),
      if (_total > _autorizacoes.length)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(
            'Mostrando ${_autorizacoes.length} de $_total autorizações.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: Cores.mudo),
          ),
        ),
    ];
  }

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
          child: RefreshIndicator(
            onRefresh: _carregar,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
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
                          DropdownButtonFormField<String?>(
                            initialValue: _filtro,
                            isExpanded: true,
                            items: [
                              for (final e in _situacoes.entries)
                                DropdownMenuItem<String?>(
                                  value: e.key,
                                  child: Text(e.value),
                                ),
                            ],
                            onChanged: (v) {
                              setState(() => _filtro = v);
                              _carregar();
                            },
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
                            decoration: const InputDecoration(
                              hintText: 'Buscar',
                            ),
                            onChanged: (v) =>
                                setState(() => _busca = v.trim().toLowerCase()),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ..._conteudo(),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Confirmação de cancelamento. Devolve o motivo (pode ser vazio) ou null se desistir.
class _DialogoCancelamento extends StatefulWidget {
  const _DialogoCancelamento();

  @override
  State<_DialogoCancelamento> createState() => _DialogoCancelamentoState();
}

class _DialogoCancelamentoState extends State<_DialogoCancelamento> {
  final _motivo = TextEditingController();

  @override
  void dispose() {
    _motivo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text(
        'Cancelar autorização',
        style: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: Cores.azul,
        ),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Esta ação não pode ser desfeita.'),
          const SizedBox(height: 12),
          TextField(
            controller: _motivo,
            maxLength: 500,
            decoration: const InputDecoration(labelText: 'Motivo (opcional)'),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Voltar'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(_motivo.text.trim()),
          child: const Text(
            'Cancelar autorização',
            style: TextStyle(color: Cores.erro),
          ),
        ),
      ],
    );
  }
}
