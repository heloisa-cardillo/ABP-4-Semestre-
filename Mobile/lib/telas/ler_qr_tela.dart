import 'dart:async';

import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../services/localizacao_service.dart';
import '../tema.dart';
import '../widgets/leitor_qr_camera.dart';
import 'resultado_acesso_tela.dart';

/// Monta o leitor de QR. Os testes trocam a câmera por um leitor falso.
typedef LeitorQrBuilder =
    Widget Function(
      BuildContext context,
      bool ativo,
      ValueChanged<String> onCodigo,
    );

Widget _leitorCamera(BuildContext _, bool ativo, ValueChanged<String> onCodigo) =>
    LeitorQrCamera(ativo: ativo, onCodigo: onCodigo);

/// Leitura do QR Code do terminal (US7): lê o código, junta a posição do celular,
/// envia ao backend e mostra o resultado.
///
/// O QR vale só 10 segundos e uma única vez. Por isso a posição e o servidor são
/// "aquecidos" quando a aba abre, e a leitura não espera o GPS se já houver posição recente.
class LerQrTela extends StatefulWidget {
  final ApiService apiService;

  /// Se esta aba é a visível. Com `false` a câmera e o GPS ficam desligados.
  final bool ativa;

  /// Chamado quando a API responde 401: o app volta ao login.
  final VoidCallback onSessaoExpirada;

  final LocalizacaoService? localizacao;
  final LeitorQrBuilder leitorBuilder;

  const LerQrTela({
    super.key,
    required this.apiService,
    required this.onSessaoExpirada,
    this.ativa = true,
    this.localizacao,
    this.leitorBuilder = _leitorCamera,
  });

  @override
  State<LerQrTela> createState() => _LerQrTelaState();
}

class _LerQrTelaState extends State<LerQrTela> {
  /// Posição mais velha que isso é pedida de novo antes de enviar.
  static const _validadePosicao = Duration(seconds: 30);
  static const _intervaloAtualizacao = Duration(seconds: 20);

  late final LocalizacaoService _localizacao =
      widget.localizacao ?? GeolocatorLocalizacaoService();

  Posicao? _posicao;
  Future<Posicao>? _buscandoPosicao;
  Timer? _timerPosicao;

  bool _processando = false;
  bool _mostrandoResultado = false;

  /// O código já enviado não é enviado de novo: ele é de uso único.
  String? _ultimoCodigoEnviado;

  String? _erro;
  FalhaLocalizacao? _falhaLocalizacao;

  bool get _cameraLigada =>
      widget.ativa && !_processando && !_mostrandoResultado;

  @override
  void initState() {
    super.initState();
    if (widget.ativa) _preparar();
  }

  @override
  void didUpdateWidget(LerQrTela oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.ativa && !oldWidget.ativa) _preparar();
    if (!widget.ativa && oldWidget.ativa) _timerPosicao?.cancel();
  }

  @override
  void dispose() {
    _timerPosicao?.cancel();
    super.dispose();
  }

  void _preparar() {
    unawaited(widget.apiService.acordarServidor());
    unawaited(_atualizarEmSegundoPlano());
    _timerPosicao?.cancel();
    _timerPosicao = Timer.periodic(_intervaloAtualizacao, (_) {
      // Depois de uma falha só tenta de novo quando a pessoa pedir: senão o pedido
      // de permissão apareceria a cada intervalo.
      if (_falhaLocalizacao == null) unawaited(_atualizarEmSegundoPlano());
    });
  }

  /// Busca a posição, reaproveitando uma busca em andamento. Lança [LocalizacaoException].
  Future<Posicao> _atualizarPosicao() {
    return _buscandoPosicao ??= _buscarPosicao().whenComplete(
      () => _buscandoPosicao = null,
    );
  }

  Future<Posicao> _buscarPosicao() async {
    try {
      final posicao = await _localizacao.obterPosicao();
      if (mounted) {
        setState(() {
          _posicao = posicao;
          if (_falhaLocalizacao != null) {
            _falhaLocalizacao = null;
            _erro = null;
          }
        });
      }
      return posicao;
    } on LocalizacaoException catch (e) {
      if (mounted) {
        setState(() {
          _posicao = null;
          _falhaLocalizacao = e.falha;
          _erro = e.message;
        });
      }
      rethrow;
    }
  }

  Future<void> _atualizarEmSegundoPlano() async {
    try {
      await _atualizarPosicao();
    } catch (_) {
      // A falha já aparece na tela por `_buscarPosicao`.
    }
  }

  Future<Posicao> _posicaoParaEnvio() async {
    final atual = _posicao;
    if (atual != null &&
        DateTime.now().difference(atual.obtidaEm) < _validadePosicao) {
      return atual;
    }
    return _atualizarPosicao();
  }

  Future<void> _aoLerCodigo(String codigo) async {
    if (_processando || _mostrandoResultado) return;
    if (codigo == _ultimoCodigoEnviado) return;

    // Confere o formato antes de gastar uma tentativa no backend (outro QR qualquer daria 400).
    if (!qrCodeTerminalPattern.hasMatch(codigo)) {
      const msg = 'Este QR Code não é de um terminal de acesso.';
      if (_erro != msg) {
        setState(() {
          _erro = msg;
          _falhaLocalizacao = null;
        });
      }
      return;
    }

    setState(() {
      _processando = true;
      _erro = null;
    });

    try {
      final Posicao posicao;
      try {
        posicao = await _posicaoParaEnvio();
      } on LocalizacaoException catch (e) {
        _mostrarErro(e.message, falha: e.falha);
        return;
      }

      final DecisaoAcesso decisao;
      try {
        decisao = await widget.apiService.validarQrCode(
          codigo: codigo,
          latitude: posicao.latitude,
          longitude: posicao.longitude,
        );
      } on ApiException catch (e) {
        if (e.sessaoExpirada) {
          widget.onSessaoExpirada();
          return;
        }
        // 400 ou falha de rede: o código pode não ter chegado, não marca como enviado.
        _mostrarErro(e.message);
        return;
      }

      _ultimoCodigoEnviado = codigo;
      if (!mounted) return;
      await _abrirResultado(decisao);
    } finally {
      if (mounted) setState(() => _processando = false);
    }
  }

  Future<void> _abrirResultado(DecisaoAcesso decisao) async {
    setState(() => _mostrandoResultado = true);
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (rotaContext) => Scaffold(
          body: ResultadoAcessoTela(
            liberado: decisao.liberado,
            detalhe: decisao.motivoTexto,
            onVoltar: () => Navigator.of(rotaContext).pop(),
          ),
        ),
      ),
    );
    if (mounted) setState(() => _mostrandoResultado = false);
  }

  void _mostrarErro(String mensagem, {FalhaLocalizacao? falha}) {
    if (!mounted) return;
    setState(() {
      _erro = mensagem;
      _falhaLocalizacao = falha;
    });
  }

  Future<void> _tentarLocalizacaoDeNovo() async {
    final falha = _falhaLocalizacao;
    if (falha == FalhaLocalizacao.permissaoNegadaParaSempre ||
        falha == FalhaLocalizacao.servicoDesligado) {
      await _localizacao.abrirConfiguracoes(falha!);
    }
    await _atualizarEmSegundoPlano();
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
              'Ler QR Code',
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
                _areaLeitura(context),
                const SizedBox(height: 12),
                _status(),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _areaLeitura(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: 330,
        color: const Color(0xFF0B1D36),
        child: Stack(
          alignment: Alignment.center,
          fit: StackFit.expand,
          children: [
            if (widget.ativa)
              widget.leitorBuilder(context, _cameraLigada, _aoLerCodigo),
            IgnorePointer(
              child: Center(
                child: Container(
                  width: 190,
                  height: 190,
                  decoration: BoxDecoration(
                    border: Border.all(color: Cores.azul3, width: 4),
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
              ),
            ),
            if (_processando)
              const ColoredBox(
                color: Color(0x99000000),
                child: Center(
                  child: CircularProgressIndicator(color: Colors.white),
                ),
              ),
            const Positioned(
              bottom: 12,
              left: 12,
              right: 12,
              child: IgnorePointer(
                child: Text(
                  'Aponte para o QR Code do terminal',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: Color(0xFFCFE1FB)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _status() {
    if (_processando) {
      return const Text(
        'Validando acesso...',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 15, color: Cores.mudo),
      );
    }

    final erro = _erro;
    if (erro != null) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Cores.erroFundo,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              erro,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, color: Cores.erro),
            ),
            if (_falhaLocalizacao != null) ...[
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _tentarLocalizacaoDeNovo,
                child: Text(
                  _falhaLocalizacao ==
                              FalhaLocalizacao.permissaoNegadaParaSempre ||
                          _falhaLocalizacao == FalhaLocalizacao.servicoDesligado
                      ? 'Abrir configurações'
                      : 'Tentar de novo',
                ),
              ),
            ],
          ],
        ),
      );
    }

    return Text(
      _posicao == null ? 'Obtendo sua localização...' : 'Localização pronta.',
      textAlign: TextAlign.center,
      style: const TextStyle(fontSize: 15, color: Cores.mudo),
    );
  }
}
