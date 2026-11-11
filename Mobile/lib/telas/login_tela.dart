import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../tema.dart';

enum Perfil { condomino, visitante, administrador }

class LoginTela extends StatefulWidget {
  final ApiService apiService;
  final void Function(Perfil perfil) onEntrar;

  const LoginTela({super.key, required this.apiService, required this.onEntrar});

  @override
  State<LoginTela> createState() => _LoginTelaState();
}

class _LoginTelaState extends State<LoginTela> {
  Perfil? _escolhido;
  final _emailController = TextEditingController();
  final _senhaController = TextEditingController();
  bool _carregando = false;
  String? _erro;

  bool get _admin => _escolhido == Perfil.administrador;

  /// Perfil do app (da escolha na tela) -> `role` devolvido pela API.
  String get _roleEsperada {
    switch (_escolhido) {
      case Perfil.visitante:
        return 'VISITOR';
      case Perfil.administrador:
        return 'ADMIN';
      default:
        return 'RESIDENT';
    }
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

  List<Widget> _escolhaPerfil() {
    return [
      ElevatedButton(
        onPressed: () => setState(() => _escolhido = Perfil.condomino),
        child: const Text('Entrar como Condômino'),
      ),
      const SizedBox(height: 8),
      OutlinedButton(
        onPressed: () => setState(() => _escolhido = Perfil.visitante),
        child: const Text('Entrar como Visitante'),
      ),
      const SizedBox(height: 8),
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
      TextField(
        controller: _emailController,
        keyboardType: TextInputType.emailAddress,
        style: const TextStyle(fontSize: 16, color: Cores.texto),
        decoration: const InputDecoration(hintText: 'seu@email.com'),
      ),
      _rotulo('Senha'),
      TextField(
        controller: _senhaController,
        obscureText: true,
        style: const TextStyle(fontSize: 16, color: Cores.texto),
        decoration: const InputDecoration(hintText: '••••••••'),
      ),
      if (_erro != null) ...[
        const SizedBox(height: 8),
        Text(
          _erro!,
          style: const TextStyle(fontSize: 14, color: Cores.erro),
          textAlign: TextAlign.center,
        ),
      ],
      const SizedBox(height: 12),
      ElevatedButton(
        onPressed: _carregando ? null : _fazerLogin,
        child: _carregando
            ? const SizedBox(
                height: 24,
                width: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              )
            : const Text('Entrar'),
      ),
      const SizedBox(height: 12),
      OutlinedButton(
        onPressed: _carregando ? null : () => setState(() => _escolhido = null),
        child: const Text('Voltar'),
      ),
    ];
  }

  Future<void> _fazerLogin() async {
    final email = _emailController.text.trim();
    final senha = _senhaController.text;

    if (email.isEmpty || senha.isEmpty) {
      setState(() => _erro = 'Preencha e-mail e senha');
      return;
    }

    setState(() {
      _carregando = true;
      _erro = null;
    });

    try {
      final sucesso = await widget.apiService.login(
        email: email,
        password: senha,
      );

      if (sucesso && widget.apiService.userProfile != _roleEsperada) {
        // Credenciais válidas, mas a conta é de outro perfil.
        await widget.apiService.logout();
        if (mounted) {
          setState(() => _erro = 'Esta conta não pertence ao perfil selecionado');
        }
      } else if (sucesso && mounted) {
        widget.onEntrar(_escolhido!);
      } else if (mounted) {
        setState(() => _erro = 'E-mail ou senha inválidos');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _erro = 'Erro de conexão. Tente novamente.');
      }
    } finally {
      if (mounted) {
        setState(() => _carregando = false);
      }
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _senhaController.dispose();
    super.dispose();
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