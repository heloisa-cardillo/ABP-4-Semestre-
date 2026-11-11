import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../tema.dart';

const _corErro = Color(0xFFB3261E);

// Tipo do "local de cima" (Edifício › Portaria › Porta › Catraca)
const _tipoPai = {
  'GATEHOUSE': 'BUILDING',
  'DOOR': 'GATEHOUSE',
  'TURNSTILE': 'DOOR',
};

// Rótulo exibido -> valor da API
const _tiposLocal = {
  'Edifício': 'BUILDING',
  'Portaria': 'GATEHOUSE',
  'Porta': 'DOOR',
  'Catraca': 'TURNSTILE',
};

String? _rotuloDoTipo(String? valor) {
  for (final e in _tiposLocal.entries) {
    if (e.value == valor) return e.key;
  }
  return null;
}

class UsuariosLocaisTela extends StatefulWidget {
  final ApiService apiService;

  const UsuariosLocaisTela({super.key, required this.apiService});

  @override
  State<UsuariosLocaisTela> createState() => _UsuariosLocaisTelaState();
}

class _UsuariosLocaisTelaState extends State<UsuariosLocaisTela> {
  static const _abas = ['Condôminos', 'Administradores', 'Locais'];
  static const _botoes = [
    'Cadastrar condômino',
    'Cadastrar administrador',
    'Cadastrar local',
  ];

  int _abaAtual = 0;
  bool _carregando = true;
  String? _erro;
  List<Pessoa> _condominos = [];
  List<Pessoa> _administradores = [];
  List<Local> _locais = [];

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
      final r = await Future.wait<Object>([
        widget.apiService.listarUsuarios('RESIDENT'),
        widget.apiService.listarUsuarios('ADMIN'),
        widget.apiService.listarLocais(),
      ]);
      if (!mounted) return;
      setState(() {
        _condominos = r[0] as List<Pessoa>;
        _administradores = r[1] as List<Pessoa>;
        _locais = r[2] as List<Local>;
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
        _erro = 'Erro inesperado ao carregar os dados.';
        _carregando = false;
      });
    }
  }

  void _mostrarMensagem(String texto, {bool erro = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(texto),
          backgroundColor: erro ? _corErro : const Color(0xFF1D7A46),
        ),
      );
  }

  Future<void> _abrirModal({Pessoa? pessoa, Local? local}) async {
    final salvou = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _FormularioCadastro(
        apiService: widget.apiService,
        aba: _abaAtual,
        pessoa: pessoa,
        local: local,
        locais: _locais,
      ),
    );
    if (salvou == true && mounted) {
      _mostrarMensagem(
        pessoa != null || local != null
            ? 'Alterações salvas com sucesso.'
            : 'Cadastro realizado com sucesso.',
      );
      _carregar();
    }
  }

  Widget _aba(int indice) {
    final selecionada = indice == _abaAtual;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _abaAtual = indice),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 11),
          alignment: Alignment.center,
          color: selecionada ? Cores.azul2 : Colors.white,
          child: Text(
            _abas[indice],
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

  Widget _item(String titulo, String subtitulo, VoidCallback aoEditar) {
    return Card(
      child: ListTile(
        title: Text(
          titulo,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Cores.azul,
          ),
        ),
        subtitle: Text(subtitulo),
        trailing: IconButton(
          icon: const Icon(Icons.edit, color: Cores.azul2),
          tooltip: 'Editar',
          onPressed: aoEditar,
        ),
      ),
    );
  }

  String _descricaoLocal(Local l) {
    final tipo = _rotuloDoTipo(l.type) ?? l.type;
    final endereco = l.address;
    return endereco == null || endereco.isEmpty ? tipo : '$tipo • $endereco';
  }

  Widget _lista() {
    if (_carregando) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_erro != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 30),
        child: Column(
          children: [
            Text(
              _erro!,
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

    final List<Widget> itens;
    if (_abaAtual == 2) {
      itens = [
        for (final l in _locais)
          _item(l.name, _descricaoLocal(l), () => _abrirModal(local: l)),
      ];
    } else {
      final pessoas = _abaAtual == 0 ? _condominos : _administradores;
      itens = [
        for (final p in pessoas)
          _item(p.name, p.email, () => _abrirModal(pessoa: p)),
      ];
    }

    if (itens.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(
          child: Text(
            'Nenhum registro',
            style: TextStyle(fontSize: 16, color: Cores.mudo),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(children: itens),
    );
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
              'Cadastros',
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
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    decoration: BoxDecoration(
                      border: Border.all(color: Cores.azul2, width: 2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Row(
                      children: [
                        for (var i = 0; i < _abas.length; i++) _aba(i),
                      ],
                    ),
                  ),
                  _lista(),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () => _abrirModal(),
                    child: Text(_botoes[_abaAtual]),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Formulário de cadastro/edição (condômino, administrador ou local).
class _FormularioCadastro extends StatefulWidget {
  final ApiService apiService;
  final int aba;
  final Pessoa? pessoa;
  final Local? local;
  final List<Local> locais;

  const _FormularioCadastro({
    required this.apiService,
    required this.aba,
    required this.locais,
    this.pessoa,
    this.local,
  });

  @override
  State<_FormularioCadastro> createState() => _FormularioCadastroState();
}

class _FormularioCadastroState extends State<_FormularioCadastro> {
  static const _nomes = ['condômino', 'administrador', 'local'];

  final _chave = GlobalKey<FormState>();
  late final _nome = TextEditingController(
    text: widget.pessoa?.name ?? widget.local?.name,
  );
  late final _email = TextEditingController(text: widget.pessoa?.email);
  final _senha = TextEditingController();
  late final _tag = TextEditingController(text: widget.pessoa?.nfcUid);
  late final _endereco = TextEditingController(text: widget.local?.address);
  late final _latitude = TextEditingController(
    text: widget.local?.latitude?.toString(),
  );
  late final _longitude = TextEditingController(
    text: widget.local?.longitude?.toString(),
  );
  late String? _tipo = _rotuloDoTipo(widget.local?.type);
  late String? _localDeCimaId = widget.local?.parentId;

  bool _salvando = false;
  String? _erro;

  bool get _ehLocal => widget.aba == 2;
  bool get _editando => widget.pessoa != null || widget.local != null;

  @override
  void dispose() {
    _nome.dispose();
    _email.dispose();
    _senha.dispose();
    _tag.dispose();
    _endereco.dispose();
    _latitude.dispose();
    _longitude.dispose();
    super.dispose();
  }

  // ---------- validações ----------

  String? _validarNome(String? v) {
    final t = (v ?? '').trim();
    if (t.length < 2) return 'Informe o nome (mínimo 2 caracteres)';
    if (t.length > 120) return 'O nome pode ter no máximo 120 caracteres';
    return null;
  }

  String? _validarEmail(String? v) {
    if (v == null || v.trim().isEmpty) return 'Informe o e-mail';
    final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v.trim());
    return ok ? null : 'E-mail inválido';
  }

  String? _validarSenha(String? v) {
    if (!_editando && (v == null || v.isEmpty)) return 'Informe a senha';
    if (v != null && v.isNotEmpty && v.length < 8) {
      return 'A senha precisa ter ao menos 8 caracteres';
    }
    return null;
  }

  String? _validarEndereco(String? v) {
    final t = (v ?? '').trim();
    if (t.length < 5) return 'Informe o endereço completo';
    if (t.length > 255) return 'O endereço é muito longo';
    return null;
  }

  double? _numero(String? v) =>
      double.tryParse((v ?? '').trim().replaceAll(',', '.'));

  String? _validarCoordenada(
    String? v,
    String campo,
    double limite, {
    required bool obrigatoria,
    required TextEditingController outro,
  }) {
    final vazio = v == null || v.trim().isEmpty;
    if (vazio) {
      if (obrigatoria) return 'Informe a $campo';
      // opcional, mas latitude e longitude andam juntas
      return outro.text.trim().isEmpty
          ? null
          : 'Informe latitude e longitude juntas';
    }
    final n = _numero(v);
    if (n == null) return 'Número inválido';
    if (n < -limite || n > limite) return 'Deve estar entre -$limite e $limite';
    return null;
  }

  String _normalizarTag(String v) =>
      v.replaceAll(RegExp(r'[\s:\-]'), '').toUpperCase();

  String? _validarTag(String? v) {
    if (v == null || v.trim().isEmpty) return null; // opcional
    final ok = RegExp(r'^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$')
        .hasMatch(_normalizarTag(v));
    return ok ? null : 'UID inválido: use 8, 14 ou 20 caracteres (0-9 e A-F)';
  }

  // ---------- salvar ----------

  Future<void> _salvar() async {
    if (!_chave.currentState!.validate()) return;
    setState(() {
      _salvando = true;
      _erro = null;
    });

    try {
      final Map<String, dynamic> dados;

      if (_ehLocal) {
        final nome = _nome.text.trim();
        final lat = _numero(_latitude.text);
        final lng = _numero(_longitude.text);

        if (_editando) {
          final atual = widget.local!;
          final mudouCoordenadas =
              lat != atual.latitude || lng != atual.longitude;
          dados = {
            if (nome != atual.name) 'name': nome,
            if (atual.type == 'BUILDING' &&
                _endereco.text.trim() != (atual.address ?? ''))
              'address': _endereco.text.trim(),
            if (mudouCoordenadas) 'latitude': lat,
            if (mudouCoordenadas) 'longitude': lng,
          };
        } else {
          final tipoApi = _tiposLocal[_tipo]!;
          dados = {
            'name': nome,
            'type': tipoApi,
            if (tipoApi == 'BUILDING') 'address': _endereco.text.trim(),
            if (lat != null) 'latitude': lat,
            if (lng != null) 'longitude': lng,
            if (_tipoPai.containsKey(tipoApi) && _localDeCimaId != null)
              'parentId': _localDeCimaId,
          };
        }

        if (_editando && dados.isEmpty) {
          Navigator.of(context).pop(false); // nada mudou
          return;
        }
        await widget.apiService.salvarLocal(id: widget.local?.id, dados: dados);
      } else {
        final nome = _nome.text.trim();
        final email = _email.text.trim().toLowerCase();
        final tag = _normalizarTag(_tag.text);

        if (_editando) {
          final atual = widget.pessoa!;
          dados = {
            if (nome != atual.name) 'name': nome,
            if (email != atual.email) 'email': email,
            if (_senha.text.isNotEmpty) 'password': _senha.text,
            if (widget.aba == 0 && tag != (atual.nfcUid ?? ''))
              'nfcUid': tag.isEmpty ? null : tag,
          };
        } else {
          dados = {
            'name': nome,
            'email': email,
            'password': _senha.text,
            'role': widget.aba == 0 ? 'RESIDENT' : 'ADMIN',
            if (widget.aba == 0 && tag.isNotEmpty) 'nfcUid': tag,
          };
        }

        if (_editando && dados.isEmpty) {
          Navigator.of(context).pop(false); // nada mudou
          return;
        }
        await widget.apiService
            .salvarUsuario(id: widget.pessoa?.id, dados: dados);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _salvando = false;
        _erro = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _salvando = false;
        _erro = 'Erro inesperado. Tente novamente.';
      });
    }
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

  Widget _campo(
    String rotulo,
    TextEditingController controller, {
    bool senha = false,
    TextInputType teclado = TextInputType.text,
    String? Function(String?)? validator,
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
          validator: validator,
          style: const TextStyle(fontSize: 16, color: Cores.texto),
          decoration: ajuda == null ? null : InputDecoration(helperText: ajuda),
        ),
      ],
    );
  }

  List<Widget> _camposPessoa() {
    return [
      _campo('Nome', _nome, validator: _validarNome),
      _campo(
        'E-mail',
        _email,
        teclado: TextInputType.emailAddress,
        validator: _validarEmail,
      ),
      _campo(
        'Senha',
        _senha,
        senha: true,
        validator: _validarSenha,
        ajuda: _editando ? 'Deixe em branco para manter a atual' : null,
      ),
      if (widget.aba == 0)
        _campo('Código da tag NFC', _tag, validator: _validarTag),
    ];
  }

  List<Widget> _camposLocal() {
    const numero = TextInputType.numberWithOptions(decimal: true, signed: true);
    final tipoApi = _tiposLocal[_tipo];
    final tipoPai = _tipoPai[tipoApi];
    final ehEdificio = tipoApi == 'BUILDING';
    final exigeCoordenadas = ehEdificio || tipoApi == 'TURNSTILE';
    final opcoesPai = widget.locais
        .where((l) => l.type == tipoPai && l.id != widget.local?.id)
        .toList();

    return [
      _rotulo('Tipo'),
      DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: _tipo,
        hint: const Text('Selecione o tipo'),
        items: [
          for (final t in _tiposLocal.keys)
            DropdownMenuItem(value: t, child: Text(t)),
        ],
        validator: (v) => v == null ? 'Selecione o tipo' : null,
        onChanged: _editando
            ? null
            : (v) => setState(() {
                  _tipo = v;
                  _localDeCimaId = null;
                }),
      ),
      if (tipoPai != null) ...[
        _rotulo('Local de cima (${_rotuloDoTipo(tipoPai)})'),
        DropdownButtonFormField<String>(
          key: ValueKey(tipoApi),
          isExpanded: true,
          initialValue: opcoesPai.any((l) => l.id == _localDeCimaId)
              ? _localDeCimaId
              : null,
          hint: const Text('Selecione o local'),
          items: [
            for (final l in opcoesPai)
              DropdownMenuItem(value: l.id, child: Text(l.name)),
          ],
          validator: (v) => v == null ? 'Selecione o local de cima' : null,
          onChanged: _editando ? null : (v) => _localDeCimaId = v,
        ),
        if (opcoesPai.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              'Cadastre antes: ${_rotuloDoTipo(tipoPai)}.',
              style: const TextStyle(fontSize: 13, color: _corErro),
            ),
          ),
      ],
      _campo('Nome', _nome, validator: _validarNome),
      if (ehEdificio)
        _campo('Endereço', _endereco, validator: _validarEndereco),
      _campo(
        exigeCoordenadas ? 'Latitude' : 'Latitude (opcional)',
        _latitude,
        teclado: numero,
        validator: (v) => _validarCoordenada(
          v,
          'latitude',
          90,
          obrigatoria: exigeCoordenadas,
          outro: _longitude,
        ),
      ),
      _campo(
        exigeCoordenadas ? 'Longitude' : 'Longitude (opcional)',
        _longitude,
        teclado: numero,
        validator: (v) => _validarCoordenada(
          v,
          'longitude',
          180,
          obrigatoria: exigeCoordenadas,
          outro: _latitude,
        ),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        '${_editando ? 'Editar' : 'Cadastrar'} ${_nomes[widget.aba]}',
        style: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: Cores.azul,
        ),
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Form(
            key: _chave,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ..._ehLocal ? _camposLocal() : _camposPessoa(),
                if (_erro != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text(
                      _erro!,
                      style: const TextStyle(fontSize: 14, color: _corErro),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _salvando ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancelar'),
        ),
        TextButton(
          onPressed: _salvando ? null : _salvar,
          child: _salvando
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Salvar'),
        ),
      ],
    );
  }
}