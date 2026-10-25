import 'package:flutter/material.dart';

import '../tema.dart';

class UsuariosLocaisTela extends StatefulWidget {
  const UsuariosLocaisTela({super.key});

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
  static const _tiposLocal = ['Edifício', 'Portaria', 'Porta', 'Catraca'];

  int _abaAtual = 0;

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

  List<Widget> _camposPessoa() {
    return [
      _campo('Nome'),
      _campo('E-mail', teclado: TextInputType.emailAddress),
      _campo('Senha', senha: true),
    ];
  }

  List<Widget> _camposLocal() {
    const numero = TextInputType.numberWithOptions(decimal: true, signed: true);
    return [
      _rotulo('Tipo'),
      DropdownButtonFormField<String>(
        isExpanded: true,
        hint: const Text('Selecione o tipo'),
        items: [
          for (final tipo in _tiposLocal)
            DropdownMenuItem(value: tipo, child: Text(tipo)),
        ],
        onChanged: (_) {},
      ),
      _campo('Nome'),
      _campo('Endereço'),
      _campo('Latitude', teclado: numero),
      _campo('Longitude', teclado: numero),
    ];
  }

  void _abrirModal() {
    final campos = _abaAtual == 2 ? _camposLocal() : _camposPessoa();

    showDialog<void>(
      context: context,
      builder: (contexto) {
        return AlertDialog(
          title: Text(
            _botoes[_abaAtual],
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Cores.azul,
            ),
          ),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: campos,
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(contexto).pop(),
              child: const Text('Cancelar'),
            ),
            TextButton(
              onPressed: () => Navigator.of(contexto).pop(),
              child: const Text('Salvar'),
            ),
          ],
        );
      },
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
          child: SingleChildScrollView(
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
                    children: [for (var i = 0; i < _abas.length; i++) _aba(i)],
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(
                    child: Text(
                      'Nenhum registro',
                      style: TextStyle(fontSize: 16, color: Cores.mudo),
                    ),
                  ),
                ),
                ElevatedButton(
                  onPressed: _abrirModal,
                  child: Text(_botoes[_abaAtual]),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
