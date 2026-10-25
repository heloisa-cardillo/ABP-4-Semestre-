import 'package:flutter/material.dart';

import 'tema.dart';
import 'telas/autorizacoes_admin_tela.dart';
import 'telas/criar_autorizacao_tela.dart';
import 'telas/historico_tela.dart';
import 'telas/ler_qr_tela.dart';
import 'telas/login_tela.dart';
import 'telas/minhas_autorizacoes_tela.dart';
import 'telas/usuarios_locais_tela.dart';

void main() {
  runApp(const ControleAcessoApp());
}

class ControleAcessoApp extends StatelessWidget {
  const ControleAcessoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Controle de Acesso',
      debugShowCheckedModeBanner: false,
      theme: temaApp(),
      home: const Principal(),
    );
  }
}

class Principal extends StatefulWidget {
  const Principal({super.key});

  @override
  State<Principal> createState() => _PrincipalState();
}

class _PrincipalState extends State<Principal> {
  static const _abasUsuario = ['Autorizações', 'Ler QR Code'];
  static const _abasAdmin = ['Autorizações', 'Nova', 'Cadastros', 'Histórico'];

  Perfil? _perfil;
  int _aba = 0;

  bool get _admin => _perfil == Perfil.administrador;

  void _entrar(Perfil perfil) {
    setState(() {
      _perfil = perfil;
      _aba = 0;
    });
  }

  List<Widget> _telas() {
    if (_admin) {
      return const [
        AutorizacoesAdminTela(),
        CriarAutorizacaoTela(),
        UsuariosLocaisTela(),
        HistoricoTela(),
      ];
    }
    return const [MinhasAutorizacoesTela(), LerQrTela()];
  }

  Widget _barra() {
    final abas = _admin ? _abasAdmin : _abasUsuario;
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Cores.borda, width: 2)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 56,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < abas.length; i++)
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => _aba = i),
                    child: Container(
                      alignment: Alignment.center,
                      color: i == _aba ? Cores.claro : Colors.white,
                      child: Text(
                        abas[i],
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: i == _aba ? Cores.azul : Cores.mudo,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_perfil == null) {
      return LoginTela(onEntrar: _entrar);
    }

    return Scaffold(
      body: IndexedStack(
        index: _aba,
        sizing: StackFit.expand,
        children: _telas(),
      ),
      bottomNavigationBar: _barra(),
    );
  }
}
