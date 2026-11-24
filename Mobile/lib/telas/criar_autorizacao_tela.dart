import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../tema.dart';
import '../widgets/cabecalho_tela.dart';

const _rotulosTipo = {
  'BUILDING': 'Edifício',
  'GATEHOUSE': 'Portaria',
  'DOOR': 'Porta',
  'TURNSTILE': 'Catraca',
};

class CriarAutorizacaoTela extends StatefulWidget {
  final ApiService apiService;
  final VoidCallback onLogout;


  /// Indica se esta aba está visível. Ao voltar para ela, recarrega
  /// condôminos e locais (podem ter sido cadastrados na aba "Cadastros").
  final bool ativa;

  /// Chamado depois que a autorização é criada com sucesso.
  final VoidCallback? onCriada;

  const CriarAutorizacaoTela({
    super.key,
    required this.apiService,
    required this.onLogout,

    this.ativa = true,
    this.onCriada,
  });

  @override
  State<CriarAutorizacaoTela> createState() => _CriarAutorizacaoTelaState();
}

class _CriarAutorizacaoTelaState extends State<CriarAutorizacaoTela> {
  final _chave = GlobalKey<FormState>();
  final _dataInicio = TextEditingController();
  final _dataTermino = TextEditingController();
  final _horarioInicial = TextEditingController();
  final _horarioFinal = TextEditingController();
  final _usos = TextEditingController();
  final _nome = TextEditingController();
  final _email = TextEditingController();
  final _senha = TextEditingController();
  final _nfc = TextEditingController();

  bool _visitante = false;
  bool _carregando = true;
  bool _enviando = false;
  String? _erroCarga;

  List<Pessoa> _condominos = [];
  List<Local> _locais = [];

  String? _condominoId;
  String? _localId;
  DateTime? _inicio;
  DateTime? _fim;
  TimeOfDay? _horaInicial;
  TimeOfDay? _horaFinal;

  // Muda quando os dropdowns precisam ser recriados (limpar o formulário ou
  // quando a opção escolhida deixou de existir).
  int _versao = 0;

  // Visitante com tag NFC: é cadastrado antes da autorização. Se a criação da
  // autorização falhar depois disso, guarda o cadastro para a nova tentativa
  // não dar "e-mail já cadastrado".
  String? _visitanteChave;
  String? _visitanteCriadoId;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void didUpdateWidget(CriarAutorizacaoTela antigo) {
    super.didUpdateWidget(antigo);
    if (widget.ativa && !antigo.ativa && !_carregando && !_enviando) {
      _carregar(silencioso: true);
    }
  }

  @override
  void dispose() {
    _dataInicio.dispose();
    _dataTermino.dispose();
    _horarioInicial.dispose();
    _horarioFinal.dispose();
    _usos.dispose();
    _nome.dispose();
    _email.dispose();
    _senha.dispose();
    _nfc.dispose();
    super.dispose();
  }

  /// Busca condôminos e locais. No modo [silencioso] não mostra o carregando
  /// nem o erro: mantém o que já estava na tela.
  Future<void> _carregar({bool silencioso = false}) async {
    if (!silencioso) {
      setState(() {
        _carregando = true;
        _erroCarga = null;
      });
    }
    try {
      final r = await Future.wait<Object>([
        widget.apiService.listarUsuarios('RESIDENT'),
        widget.apiService.listarLocais(),
      ]);
      if (!mounted) return;
      setState(() {
        _condominos = r[0] as List<Pessoa>;
        _locais = r[1] as List<Local>;
        // Opção escolhida que não existe mais: limpa e recria o dropdown.
        if (!_condominos.any((p) => p.id == _condominoId)) {
          _condominoId = null;
          _versao++;
        }
        if (!_locais.any((l) => l.id == _localId)) {
          _localId = null;
          _versao++;
        }
        _carregando = false;
        _erroCarga = null;
      });
    } on ApiException catch (e) {
      if (!mounted || silencioso) return;
      setState(() {
        _erroCarga = e.message;
        _carregando = false;
      });
    } catch (_) {
      if (!mounted || silencioso) return;
      setState(() {
        _erroCarga = 'Erro inesperado ao carregar os dados.';
        _carregando = false;
      });
    }
  }

  // ---------- formatação ----------

  String _dd(int n) => n.toString().padLeft(2, '0');

  String _dataBr(DateTime d) => '${_dd(d.day)}/${_dd(d.month)}/${d.year}';

  String _dataIso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${_dd(d.month)}-${_dd(d.day)}';

  String _hhmm(TimeOfDay h) => '${_dd(h.hour)}:${_dd(h.minute)}';

  int _minutos(TimeOfDay h) => h.hour * 60 + h.minute;

  // ---------- seleção de datas e horários ----------

  Future<void> _escolherData({required bool inicio}) async {
    final agora = DateTime.now();
    final data = await showDatePicker(
      context: context,
      initialDate:
          (inicio ? _inicio : _fim) ?? (inicio ? agora : (_inicio ?? agora)),
      firstDate: DateTime(agora.year - 1),
      lastDate: DateTime(agora.year + 5),
    );
    if (data == null) return;
    setState(() {
      if (inicio) {
        _inicio = data;
        _dataInicio.text = _dataBr(data);
      } else {
        _fim = data;
        _dataTermino.text = _dataBr(data);
      }
    });
  }

  Future<void> _escolherHorario({required bool inicial}) async {
    final horario = await showTimePicker(
      context: context,
      initialTime: (inicial ? _horaInicial : _horaFinal) ?? TimeOfDay.now(),
      builder: (contexto, child) => MediaQuery(
        data: MediaQuery.of(contexto).copyWith(alwaysUse24HourFormat: true),
        child: child!,
      ),
    );
    if (horario == null || !mounted) return;
    setState(() {
      if (inicial) {
        _horaInicial = horario;
        _horarioInicial.text = _hhmm(horario);
      } else {
        _horaFinal = horario;
        _horarioFinal.text = _hhmm(horario);
      }
    });
  }

  // ---------- validações (espelham as regras da API) ----------

  String? _validarDataInicio(String? v) =>
      _inicio == null ? 'Informe a data de início' : null;

  String? _validarDataTermino(String? v) {
    if (_fim == null) return 'Informe a data de término';
    if (_inicio != null && _fim!.isBefore(_inicio!)) {
      return 'Não pode ser antes do início';
    }
    final hoje = DateTime.now();
    if (_fim!.isBefore(DateTime(hoje.year, hoje.month, hoje.day))) {
      return 'Essa data já passou';
    }
    return null;
  }

  String? _validarHorarioInicial(String? v) =>
      _horaInicial == null ? 'Informe o horário inicial' : null;

  String? _validarHorarioFinal(String? v) {
    if (_horaFinal == null) return 'Informe o horário final';
    if (_horaInicial != null &&
        _minutos(_horaFinal!) <= _minutos(_horaInicial!)) {
      return 'Precisa ser depois do inicial';
    }
    return null;
  }

  String? _validarUsos(String? v) {
    final t = (v ?? '').trim();
    if (t.isEmpty) return null; // sem limite
    final n = int.tryParse(t);
    if (n == null || n < 1) return 'Informe um número inteiro maior que zero';
    if (n > 10000) return 'O máximo é 10000 utilizações';
    return null;
  }

  String? _validarNome(String? v) =>
      (v ?? '').trim().length < 2 ? 'Informe o nome' : null;

  String? _validarEmail(String? v) {
    final t = (v ?? '').trim();
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t)) {
      return 'E-mail inválido';
    }
    return null;
  }

  String? _validarSenha(String? v) =>
      (v ?? '').length < 8 ? 'A senha precisa ter ao menos 8 caracteres' : null;

  String? _validarNfc(String? v) {
    final t = (v ?? '').trim();
    if (t.isEmpty) return null; // opcional
    final hex = t.replaceAll(RegExp(r'[\s:-]'), '').toUpperCase();
    if (!RegExp(r'^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$').hasMatch(hex)) {
      return 'Código inválido (ex.: 04:A1:B2:C3)';
    }
    return null;
  }

  // ---------- envio ----------

  /// Dados da autorização, prontos para o POST /authorizations.
  ///
  /// Condômino: manda `userId`. Visitante novo sem tag NFC: manda `visitor`
  /// (a API cadastra o visitante junto). Visitante novo com tag NFC: a API só
  /// aceita `nfcUid` em POST /users, então cadastra antes e manda `userId`.
  Future<Map<String, dynamic>> _montarDados() async {
    final usos = int.tryParse(_usos.text.trim());
    final dados = <String, dynamic>{
      'locationId': _localId,
      'startDate': _dataIso(_inicio!),
      'endDate': _dataIso(_fim!),
      'startTime': _hhmm(_horaInicial!),
      'endTime': _hhmm(_horaFinal!),
      if (usos != null) 'maxUses': usos,
    };

    if (!_visitante) {
      dados['userId'] = _condominoId;
      return dados;
    }

    final nome = _nome.text.trim();
    final email = _email.text.trim().toLowerCase();
    final senha = _senha.text;
    final nfc = _nfc.text.trim();

    if (nfc.isEmpty) {
      dados['visitor'] = {'name': nome, 'email': email, 'password': senha};
      return dados;
    }

    final chave = '$email|$nfc';
    if (_visitanteChave != chave || _visitanteCriadoId == null) {
      _visitanteCriadoId = await widget.apiService.criarVisitante(
        nome: nome,
        email: email,
        senha: senha,
        nfcUid: nfc,
      );
      _visitanteChave = chave;
    }
    dados['userId'] = _visitanteCriadoId;
    return dados;
  }

  Future<void> _criar() async {
    if (_enviando) return;
    if (!_chave.currentState!.validate()) return;

    setState(() => _enviando = true);
    try {
      final dados = await _montarDados();
      await widget.apiService.criarAutorizacao(dados);
      if (!mounted) return;
      _mensagem('Autorização criada com sucesso.');
      _limpar();
      widget.onCriada?.call();
    } on ApiException catch (e) {
      if (!mounted) return;
      _mensagem(e.message, erro: true);
    } catch (_) {
      if (!mounted) return;
      _mensagem('Erro inesperado. Tente novamente.', erro: true);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _limpar() {
    _dataInicio.clear();
    _dataTermino.clear();
    _horarioInicial.clear();
    _horarioFinal.clear();
    _usos.clear();
    _nome.clear();
    _email.clear();
    _senha.clear();
    _nfc.clear();
    setState(() {
      _condominoId = null;
      _localId = null;
      _inicio = null;
      _fim = null;
      _horaInicial = null;
      _horaFinal = null;
      _visitanteChave = null;
      _visitanteCriadoId = null;
      _versao++;
    });
    // Tira as mensagens de erro de validação que ficaram nos campos.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _chave.currentState?.reset(),
    );
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

  // ---------- widgets ----------

  Widget _rotulo(String texto) {
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 6),
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

  Widget _seletorCondomino() {
    return DropdownButtonFormField<String>(
      key: ValueKey('condomino-$_versao'),
      isExpanded: true,
      initialValue: _condominoId,
      hint: Text(
        _condominos.isEmpty
            ? 'Nenhum condômino cadastrado'
            : 'Selecione o condômino',
      ),
      items: [
        for (final p in _condominos)
          DropdownMenuItem(
            value: p.id,
            child: Text(p.name, overflow: TextOverflow.ellipsis),
          ),
      ],
      validator: (v) => v == null ? 'Selecione o condômino' : null,
      onChanged: (v) => setState(() => _condominoId = v),
    );
  }

  Widget _seletorLocal() {
    return DropdownButtonFormField<String>(
      key: ValueKey('local-$_versao'),
      isExpanded: true,
      initialValue: _localId,
      hint: Text(
        _locais.isEmpty ? 'Nenhum local cadastrado' : 'Selecione o local',
      ),
      items: [
        for (final l in _locais)
          DropdownMenuItem(
            value: l.id,
            child: Text(
              '${_rotulosTipo[l.type] ?? l.type} • ${l.name}',
              overflow: TextOverflow.ellipsis,
            ),
          ),
      ],
      validator: (v) => v == null ? 'Selecione o local' : null,
      onChanged: (v) => setState(() => _localId = v),
    );
  }

  Widget _campoTexto(
    String rotulo,
    TextEditingController controller,
    String? Function(String?) validator, {
    bool senha = false,
    TextInputType teclado = TextInputType.text,
    String? ajuda,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _rotulo(rotulo),
        TextFormField(
          controller: controller,
          obscureText: senha,
          keyboardType: teclado,
          autocorrect: false,
          validator: validator,
          style: const TextStyle(fontSize: 16, color: Cores.texto),
          decoration: InputDecoration(helperText: ajuda),
        ),
      ],
    );
  }

  Widget _opcao(String texto, bool selecionada, VoidCallback aoTocar) {
    return Expanded(
      child: InkWell(
        onTap: aoTocar,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 11),
          alignment: Alignment.center,
          color: selecionada ? Cores.azul2 : Colors.white,
          child: Text(
            texto,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: selecionada ? Colors.white : Cores.azul2,
            ),
          ),
        ),
      ),
    );
  }

  Widget _campoSeletor(
    TextEditingController controller,
    VoidCallback aoTocar,
    String? Function(String?) validator,
  ) {
    return TextFormField(
      controller: controller,
      readOnly: true,
      onTap: aoTocar,
      validator: validator,
      style: const TextStyle(fontSize: 16, color: Cores.texto),
    );
  }

  Widget _par(
    String rotuloEsq,
    Widget campoEsq,
    String rotuloDir,
    Widget campoDir,
  ) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [_rotulo(rotuloEsq), campoEsq],
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [_rotulo(rotuloDir), campoDir],
          ),
        ),
      ],
    );
  }

  Widget _formulario() {
    return Form(
      key: _chave,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _rotulo('Pessoa autorizada'),
          Container(
            decoration: BoxDecoration(
              border: Border.all(color: Cores.azul2, width: 2),
              borderRadius: BorderRadius.circular(12),
            ),
            clipBehavior: Clip.antiAlias,
            child: Row(
              children: [
                _opcao(
                  'Condômino',
                  !_visitante,
                  () => setState(() => _visitante = false),
                ),
                _opcao(
                  'Visitante novo',
                  _visitante,
                  () => setState(() => _visitante = true),
                ),
              ],
            ),
          ),
          if (_visitante) ...[
            _campoTexto('Nome', _nome, _validarNome),
            _campoTexto(
              'E-mail',
              _email,
              _validarEmail,
              teclado: TextInputType.emailAddress,
            ),
            _campoTexto('Senha', _senha, _validarSenha, senha: true),
            _campoTexto(
              'Código da tag NFC',
              _nfc,
              _validarNfc,
              ajuda: 'Opcional',
            ),
          ] else ...[
            const SizedBox(height: 12),
            _seletorCondomino(),
          ],
          _rotulo('Local de acesso'),
          _seletorLocal(),
          _par(
            'Data de início',
            _campoSeletor(
              _dataInicio,
              () => _escolherData(inicio: true),
              _validarDataInicio,
            ),
            'Data de término',
            _campoSeletor(
              _dataTermino,
              () => _escolherData(inicio: false),
              _validarDataTermino,
            ),
          ),
          _par(
            'Horário inicial',
            _campoSeletor(
              _horarioInicial,
              () => _escolherHorario(inicial: true),
              _validarHorarioInicial,
            ),
            'Horário final',
            _campoSeletor(
              _horarioFinal,
              () => _escolherHorario(inicial: false),
              _validarHorarioFinal,
            ),
          ),
          _rotulo('Número de utilizações'),
          TextFormField(
            controller: _usos,
            keyboardType: TextInputType.number,
            validator: _validarUsos,
            style: const TextStyle(fontSize: 16, color: Cores.texto),
            decoration: const InputDecoration(
              helperText: 'Deixe em branco para sem limite',
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _enviando ? null : _criar,
            child: _enviando
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 3,
                      color: Colors.white,
                    ),
                  )
                : const Text('Criar autorização'),
          ),
        ],
      ),
    );
  }

  Widget _corpo() {
    if (_carregando) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 60),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_erroCarga != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Column(
          children: [
            Text(
              _erroCarga!,
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
      );
    }
    return _formulario();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        CabecalhoTela(
          titulo: 'Criar autorização',
          onLogout: widget.onLogout,
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: _corpo(),
          ),
        ),
      ],
    );
  }
}