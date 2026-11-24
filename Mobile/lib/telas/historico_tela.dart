import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../tema.dart';
import '../widgets/cabecalho_tela.dart';

// Valor da API -> rótulo do filtro
const _resultados = <String?, String>{
  null: 'Todas',
  'GRANTED': 'Liberadas',
  'DENIED': 'Negadas',
};

// Motivo da negação -> texto para o administrador
const _motivos = {
  'INVALID_CREDENTIAL': 'Credencial inválida',
  'EXPIRED_CREDENTIAL': 'QR Code expirado',
  'CREDENTIAL_ALREADY_USED': 'Código já usado',
  'UNKNOWN_USER': 'Usuário não identificado',
  'USER_INACTIVE': 'Cadastro inativo',
  'TERMINAL_INACTIVE': 'Terminal desativado',
  'NO_AUTHORIZATION': 'Sem autorização',
  'AUTHORIZATION_CANCELLED': 'Autorização cancelada',
  'OUTSIDE_DATE_RANGE': 'Fora do período',
  'OUTSIDE_TIME_WINDOW': 'Fora do horário',
  'USAGE_LIMIT_REACHED': 'Limite de usos atingido',
  'OUT_OF_RANGE': 'Longe da catraca',
};

class HistoricoTela extends StatefulWidget {
  final ApiService apiService;
  final VoidCallback onLogout;

  const HistoricoTela({
    super.key,
    required this.apiService,
    required this.onLogout,
  });

  @override
  State<HistoricoTela> createState() => _HistoricoTelaState();
}

class _HistoricoTelaState extends State<HistoricoTela> {
  List<AcessoEvento> _eventos = [];
  int _total = 0;
  bool _carregando = true;
  String? _erro;
  String? _resultado;

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
      final pagina = await widget.apiService.listarHistorico(
        resultado: _resultado,
      );
      if (!mounted) return;
      setState(() {
        _eventos = pagina.items;
        _total = pagina.total;
        _carregando = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.sessaoExpirada) {
        widget.onLogout();
        return;
      }
      setState(() {
        _erro = e.message;
        _carregando = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _erro = 'Erro inesperado ao carregar o histórico.';
        _carregando = false;
      });
    }
  }

  String _dd(int n) => n.toString().padLeft(2, '0');

  String _quando(DateTime d) =>
      '${_dd(d.day)}/${_dd(d.month)}/${d.year} às ${_dd(d.hour)}:${_dd(d.minute)}';

  Widget _filtros() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Wrap(
        spacing: 8,
        children: [
          for (final e in _resultados.entries)
            ChoiceChip(
              label: Text(e.value),
              selected: _resultado == e.key,
              onSelected: (_) {
                if (_resultado == e.key) return;
                setState(() => _resultado = e.key);
                _carregar();
              },
            ),
        ],
      ),
    );
  }

  Widget _card(AcessoEvento e) {
    final cor = e.liberado ? Cores.ok : Cores.erro;
    final fundo = e.liberado ? const Color(0xFFE1F4E9) : Cores.erroFundo;
    final motivo = e.denyReason == null
        ? null
        : (_motivos[e.denyReason] ?? e.denyReason);

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
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: fundo,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  e.liberado ? 'Liberada' : 'Negada',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: cor,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                _quando(e.ocorreuEm),
                style: const TextStyle(fontSize: 13, color: Cores.mudo),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            e.nomePessoa ?? 'Credencial não identificada',
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              color: Cores.azul,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            [
              if (e.local != null) e.local!,
              if (e.terminal != null) e.terminal!,
            ].join(' • '),
            style: const TextStyle(fontSize: 14, color: Cores.mudo),
          ),
          const SizedBox(height: 2),
          Text(
            e.method == 'NFC' ? 'Tag NFC' : 'QR Code',
            style: const TextStyle(fontSize: 14, color: Cores.mudo),
          ),
          if (motivo != null) ...[
            const SizedBox(height: 6),
            Text(
              'Motivo: $motivo',
              style: const TextStyle(fontSize: 14, color: Cores.erro),
            ),
          ],
          if (e.distanciaMetros != null) ...[
            const SizedBox(height: 2),
            Text(
              '${e.distanciaMetros!.round()} m da catraca',
              style: const TextStyle(fontSize: 13, color: Cores.mudo),
            ),
          ],
        ],
      ),
    );
  }

  Widget _conteudo() {
    if (_carregando) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_erro != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            _erro!,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16, color: Cores.erro),
          ),
          const SizedBox(height: 12),
          Center(
            child: OutlinedButton(
              onPressed: _carregar,
              child: const Text('Tentar novamente'),
            ),
          ),
        ],
      );
    }
    if (_eventos.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(24),
        children: const [
          Text(
            'Nenhuma tentativa de acesso registrada.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 16, color: Cores.mudo),
          ),
        ],
      );
    }
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      itemCount: _eventos.length + 1,
      itemBuilder: (context, i) {
        if (i == _eventos.length) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'Mostrando ${_eventos.length} de $_total tentativas.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Cores.mudo),
            ),
          );
        }
        return _card(_eventos[i]);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        CabecalhoTela(
          titulo: 'Histórico de acessos',
          onLogout: widget.onLogout,
        ),
        _filtros(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _carregar,
            child: _conteudo(),
          ),
        ),
      ],
    );
  }
}