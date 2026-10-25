import 'package:flutter/material.dart';

import '../tema.dart';

enum Perfil { condomino, visitante, administrador }

class LoginTela extends StatefulWidget {
  final void Function(Perfil perfil) onEntrar;

  const LoginTela({super.key, required this.onEntrar});

  @override
  State<LoginTela> createState() => _LoginTelaState();
}

class _LoginTelaState extends State<LoginTela> {
  Perfil? _escolhido;

  bool get _admin => _escolhido == Perfil.administrador;

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

  List<Widget> _escolhaPerfil() {
    return [
      ElevatedButton(
        onPressed: () => setState(() => _escolhido = Perfil.condomino),
        child: const Text('Entrar como Usuário'),
      ),
      const SizedBox(height: 12),
      OutlinedButton(
        onPressed: () => setState(() => _escolhido = Perfil.administrador),
        child: const Text('Entrar como Administrador'),
      ),
    ];
  }

  List<Widget> _formulario() {
    return [
      Text(
        _admin ? 'Administrador' : 'Usuário',
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.bold,
          color: Cores.azul2,
        ),
      ),
      _rotulo('E-mail'),
      const TextField(
        keyboardType: TextInputType.emailAddress,
        style: TextStyle(fontSize: 16, color: Cores.texto),
      ),
      _rotulo('Senha'),
      const TextField(
        obscureText: true,
        style: TextStyle(fontSize: 16, color: Cores.texto),
      ),
      const SizedBox(height: 12),
      ElevatedButton(
        onPressed: () => widget.onEntrar(_escolhido!),
        child: const Text('Entrar'),
      ),
      const SizedBox(height: 12),
      OutlinedButton(
        onPressed: () => setState(() => _escolhido = null),
        child: const Text('Voltar'),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 84,
                    height: 84,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Cores.azul,
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: const Text(
                      '\u{1F512}',
                      style: TextStyle(fontSize: 38),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Controle de Acesso',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Cores.azul,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Entre para continuar',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: Cores.mudo),
                ),
                const SizedBox(height: 20),
                if (_escolhido == null)
                  ..._escolhaPerfil()
                else
                  ..._formulario(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
