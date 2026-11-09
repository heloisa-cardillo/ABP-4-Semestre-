import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../tema.dart';

class MinhasAutorizacoesTela extends StatefulWidget {
  final ApiService apiService;
  final VoidCallback onLogout;

  const MinhasAutorizacoesTela({
    super.key,
    required this.apiService,
    required this.onLogout,
  });

  @override
  State<MinhasAutorizacoesTela> createState() => _MinhasAutorizacoesTelaState();
}

class _MinhasAutorizacoesTelaState extends State<MinhasAutorizacoesTela> {
  static const _tamanhoPagina = 20;

  List<Authorization> _autorizacoes = [];
  bool _carregando = true;
  bool _carregandoMais = false;
  bool _temMais = true;
  int _pagina = 1;
  String? _erro; // erro da carga inicial (tela inteira)
  String? _erroMais; // erro ao carregar mais (rodapé da lista)
  String? _filtroSituacao;
  int _geracao = 0; // descarta respostas antigas ao trocar de filtro
  final _scrollController = ScrollController();

  static const _situacoes = [
    ('VALID', 'Válidas'),
    ('SCHEDULED', 'Agendadas'),
    ('EXPIRED', 'Expiradas'),
    ('EXHAUSTED', 'Esgotadas'),
    ('CANCELLED', 'Canceladas'),
  ];

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _carregar();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    if (pos.pixels >= pos.maxScrollExtent - 200) {
      _carregarMais();
    }
  }

  Future<void> _carregar({bool reiniciar = false}) async {
    if (reiniciar) {
      setState(() {
        _geracao++;
        _pagina = 1;
        _autorizacoes = [];
        _temMais = true;
        _carregando = true;
        _carregandoMais = false;
        _erro = null;
        _erroMais = null;
      });
    }

    final geracao = _geracao;
    final pagina = _pagina;

    try {
      final resultado = await widget.apiService.getMyAuthorizations(
        situation: _filtroSituacao,
        page: pagina,
        pageSize: _tamanhoPagina,
      );
      if (!mounted || geracao != _geracao) return;

      setState(() {
        _autorizacoes = pagina == 1
            ? resultado.items
            : [..._autorizacoes, ...resultado.items];
        _temMais =
            resultado.items.isNotEmpty && _autorizacoes.length < resultado.total;
        _pagina = pagina + 1;
        _carregando = false;
        _carregandoMais = false;
      });
    } on ApiException catch (e) {
      if (!mounted || geracao != _geracao) return;
      if (e.sessaoExpirada) {
        widget.onLogout(); // volta para o login
        return;
      }
      _mostrarErro(e.message);
    } catch (_) {
      if (!mounted || geracao != _geracao) return;
      _mostrarErro('Não foi possível carregar as autorizações.');
    }
  }

  void _mostrarErro(String mensagem) {
    setState(() {
      // Se já há itens na tela, o erro vira aviso no rodapé e a lista é mantida.
      if (_autorizacoes.isEmpty) {
        _erro = mensagem;
      } else {
        _erroMais = mensagem;
      }
      _carregando = false;
      _carregandoMais = false;
    });
  }

  Future<void> _carregarMais() async {
    if (_carregando || _carregandoMais || !_temMais || _erroMais != null) {
      return;
    }
    setState(() {
      _carregandoMais = true;
      _erroMais = null;
    });
    await _carregar();
  }

  Future<void> _aplicarFiltro(String? situacao) async {
    if (situacao == _filtroSituacao) return;
    setState(() => _filtroSituacao = situacao);
    await _carregar(reiniciar: true);
  }

  Widget _tag(Authorization a) {
    return Container(
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
    );
  }

  Widget _card(Authorization a) {
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
            a.location.name,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              color: Cores.azul,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.calendar_today, size: 16, color: Cores.mudo),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  a.periodoFormatado,
                  style: const TextStyle(fontSize: 14, color: Cores.mudo),
                ),
              ),
            ],
          ),
          if (a.maxUses != null) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.repeat, size: 16, color: Cores.mudo),
                const SizedBox(width: 6),
                Text(
                  'Usos: ${a.usesCount}/${a.maxUses}',
                  style: const TextStyle(fontSize: 14, color: Cores.mudo),
                ),
              ],
            ),
          ],
          if (a.cancelReason != null && a.cancelReason!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Cores.erroFundo,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, size: 16, color: Cores.erro),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Motivo do cancelamento: ${a.cancelReason}',
                      style: const TextStyle(fontSize: 13, color: Cores.erro),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildFiltro() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Filtrar por situação',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: Cores.azul,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _ChipFiltro(
                  label: 'Todas',
                  selecionado: _filtroSituacao == null,
                  onTap: () => _aplicarFiltro(null),
                ),
                const SizedBox(width: 8),
                ..._situacoes.map(
                  (s) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _ChipFiltro(
                      label: s.$2,
                      selecionado: _filtroSituacao == s.$1,
                      onTap: () => _aplicarFiltro(s.$1),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _estadoErro() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Cores.erro),
            const SizedBox(height: 12),
            Text(
              _erro!,
              style: const TextStyle(fontSize: 16, color: Cores.texto),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => _carregar(reiniciar: true),
              child: const Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _estadoVazio() {
    final filtrando = _filtroSituacao != null;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.assignment_outlined, size: 64, color: Cores.mudo),
            const SizedBox(height: 12),
            Text(
              filtrando
                  ? 'Nenhuma autorização com essa situação'
                  : 'Você ainda não possui autorizações',
              style: const TextStyle(fontSize: 16, color: Cores.mudo),
              textAlign: TextAlign.center,
            ),
            if (filtrando) ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => _aplicarFiltro(null),
                child: const Text('Ver todas'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _rodapeLista() {
    if (_erroMais != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          children: [
            Text(
              _erroMais!,
              style: const TextStyle(fontSize: 14, color: Cores.erro),
              textAlign: TextAlign.center,
            ),
            TextButton(
              onPressed: _carregarMais,
              child: const Text('Tentar novamente'),
            ),
          ],
        ),
      );
    }
    return const Padding(
      padding: EdgeInsets.all(16),
      child: Center(child: CircularProgressIndicator(color: Cores.azul2)),
    );
  }

  Widget _lista() {
    final temRodape = _carregandoMais || _erroMais != null;
    return RefreshIndicator(
      onRefresh: () => _carregar(reiniciar: true),
      color: Cores.azul2,
      child: ListView.builder(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: _autorizacoes.length + (temRodape ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == _autorizacoes.length) return _rodapeLista();
          return _card(_autorizacoes[index]);
        },
      ),
    );
  }

  Widget _conteudo() {
    if (_carregando && _autorizacoes.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: Cores.azul2));
    }
    if (_erro != null) return _estadoErro();
    if (_autorizacoes.isEmpty) return _estadoVazio();
    return _lista();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: Cores.azul,
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
          child: SafeArea(
            bottom: false,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Minhas autorizações',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                TextButton.icon(
                  onPressed: widget.onLogout,
                  icon: const Icon(Icons.logout, color: Colors.white, size: 20),
                  label: const Text(
                    'Sair',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
        ),
        _buildFiltro(),
        Expanded(child: _conteudo()),
      ],
    );
  }
}

class _ChipFiltro extends StatelessWidget {
  final String label;
  final bool selecionado;
  final VoidCallback onTap;

  const _ChipFiltro({
    required this.label,
    required this.selecionado,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selecionado,
      onSelected: (_) => onTap(),
      selectedColor: Cores.claro,
      checkmarkColor: Cores.azul,
      labelStyle: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.bold,
        color: selecionado ? Cores.azul : Cores.mudo,
      ),
      side: BorderSide(
        color: selecionado ? Cores.azul2 : Cores.borda,
        width: 2,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    );
  }
}