import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../tema.dart';

const _corErro = Color(0xFFB3261E);

const _rotulosTipo = {
  'BUILDING': 'Edifício',
  'GATEHOUSE': 'Portaria',
  'DOOR': 'Porta',
  'TURNSTILE': 'Catraca',
};

class CriarAutorizacaoTela extends StatefulWidget {
  final ApiService apiService;

  const CriarAutorizacaoTela({super.key, required this.apiService});

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

  bool _visitante = false;
  bool _carregando = true;
  String? _erroCarga;

  List<Pessoa> _condominos = [];
  List<Local> _locais = [];

  String? _condominoId;
  String? _localId;
  DateTime? _inicio;
  DateTime? _fim;
  TimeOfDay? _horaInicial;
  TimeOfDay? _horaFinal;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _dataInicio.dispose();
    _dataTermino.dispose();
    _horarioInicial.dispose();
    _horarioFinal.dispose();
    _usos.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erroCarga = null;
    });
    try {
      final r = await Future.wait<Object>([
        widget.apiService.listarUsuarios('RESIDENT'),
        widget.apiService.listarLocais(),
      ]);
      if (!mounted) return;
      setState(() {
        _condominos = r[0] as List<Pessoa>;
        _locais = r[1] as List<Local>;
        _carregando = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _erroCarga = e.message;
        _carregando = false;
      });
    } catch (_) {
      if (!mounted) return;
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

  // ---------- seleção de datas e horários ----------

  Future<void> _escolherData({required bool inicio}) async {
    final agora = DateTime.now();
    final data = await showDatePicker(
      context: context,
      initialDate: (inicio ? _inicio : _fim) ?? (inicio ? agora : (_inicio ?? agora)),
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

  // ---------- validações ----------

  String? _validarDataInicio(String? v) =>
      _inicio == null ? 'Informe a data de início' : null;

  String? _validarDataTermino(String? v) {
    if (_fim == null) return 'Informe a data de término';
    if (_inicio != null && _fim!.isBefore(_inicio!)) {
      return 'Não pode ser antes do início';
    }
    return null;
  }

  String? _validarHorarioInicial(String? v) =>
      _horaInicial == null ? 'Informe o horário inicial' : null;

  String? _validarHorarioFinal(String? v) =>
      _horaFinal == null ? 'Informe o horário final' : null;

  String? _validarUsos(String? v) {
    final t = (v ?? '').trim();
    if (t.isEmpty) return null; // sem limite
    final n = int.tryParse(t);
    if (n == null || n < 1) return 'Informe um número inteiro maior que zero';
    return null;
  }

  /// Dados da autorização, prontos para enviar à API.
  /// TODO (conectar à API): confirmar os nomes dos campos com o schema de criação de autorização.
  Map<String, dynamic> _montarDados() {
    final usos = int.tryParse(_usos.text.trim());
    return {
      'userId': _condominoId,
      'locationId': _localId,
      'startDate': _dataIso(_inicio!),
      'endDate': _dataIso(_fim!),
      'startTime': _hhmm(_horaInicial!),
      'endTime': _hhmm(_horaFinal!),
      'maxUses': usos,
    };
  }

  void _criar() {
    if (!_chave.currentState!.validate()) return;
    // TODO (conectar à API): enviar _montarDados() para a rota de criação de autorizações,
    // mostrar mensagem de sucesso/erro e limpar o formulário.
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

  Widget _texto(
    String rotulo, {
    bool senha = false,
    TextInputType teclado = TextInputType.text,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _rotulo(rotulo),
        TextField(
          obscureText: senha,
          keyboardType: teclado,
          style: const TextStyle(fontSize: 16, color: Cores.texto),
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
            _texto('Nome'),
            _texto('E-mail', teclado: TextInputType.emailAddress),
            _texto('Senha', senha: true),
            _texto('Código da tag NFC'),
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
            onPressed: _criar,
            child: const Text('Criar autorização'),
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
              style: const TextStyle(fontSize: 16, color: _corErro),
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
        Container(
          width: double.infinity,
          color: Cores.azul,
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
          child: const SafeArea(
            bottom: false,
            child: Text(
              'Criar autorização',
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
            child: _corpo(),
          ),
        ),
      ],
    );
  }
}