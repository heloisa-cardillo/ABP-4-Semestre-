import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Câmera lendo QR Codes, com zoom por pinça e por controle deslizante. Só fica ligada enquanto [ativo] for verdadeiro: a tela de leitura
/// vive num `IndexedStack` e continua montada quando a pessoa troca de aba.
class LeitorQrCamera extends StatefulWidget {
  final bool ativo;

  /// Texto do QR exatamente como decodificado (sem trim nem conversão de caixa).
  final ValueChanged<String> onCodigo;

  const LeitorQrCamera({
    super.key,
    required this.ativo,
    required this.onCodigo,
  });

  @override
  State<LeitorQrCamera> createState() => _LeitorQrCameraState();
}

class _LeitorQrCameraState extends State<LeitorQrCamera>
    with WidgetsBindingObserver {
  final _controller = MobileScannerController(
    autoStart: false,
    formats: const [BarcodeFormat.qrCode],
  );

  /// Zoom atual, de 0 (sem zoom) a 1 (zoom máximo da câmera).
  double _zoom = 0;

  /// Zoom no começo do gesto de pinça, para somar a variação do gesto a ele.
  double _zoomNoInicioDaPinca = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.ativo) unawaited(_iniciar());
  }

  @override
  void didUpdateWidget(LeitorQrCamera oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.ativo == oldWidget.ativo) return;
    unawaited(widget.ativo ? _iniciar() : _parar());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!widget.ativo) return;
    switch (state) {
      case AppLifecycleState.resumed:
        unawaited(_iniciar());
      case AppLifecycleState.inactive:
        unawaited(_parar());
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
        break;
    }
  }

  Future<void> _iniciar() async {
    try {
      await _controller.start();
      // Ao religar (troca de aba, app em segundo plano) a câmera volta sem zoom.
      if (_zoom > 0) await _aplicarZoom(_zoom);
    } catch (_) {
      // O erro (permissão negada, sem câmera...) fica em `_controller.value.error`
      // e aparece no `errorBuilder`.
    }
  }

  Future<void> _parar() async {
    try {
      await _controller.stop();
    } catch (_) {}
  }

  Future<void> _aplicarZoom(double zoom) async {
    final valor = zoom.clamp(0.0, 1.0).toDouble();
    if (mounted) setState(() => _zoom = valor);
    if (!_controller.value.isRunning) return;
    try {
      await _controller.setZoomScale(valor);
    } catch (_) {
      // Câmera sem suporte a zoom ou desligando: o leitor segue funcionando sem ele.
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Pinça com dois dedos sobre a imagem da câmera ajusta o zoom.
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onScaleStart: (_) => _zoomNoInicioDaPinca = _zoom,
          onScaleUpdate: (detalhes) {
            if (detalhes.pointerCount < 2) return;
            unawaited(
              _aplicarZoom(zoomDaPinca(_zoomNoInicioDaPinca, detalhes.scale)),
            );
          },
          child: MobileScanner(
            controller: _controller,
            onDetect: (capture) {
              if (!widget.ativo) return;
              final texto = capture.barcodes.firstOrNull?.rawValue;
              if (texto != null && texto.isNotEmpty) widget.onCodigo(texto);
            },
            errorBuilder: (context, error) => _ErroCamera(
              mensagem: _mensagemDoErro(error),
              onTentarDeNovo: _iniciar,
            ),
          ),
        ),
        // O controle só aparece com a câmera rodando (some na tela de erro).
        ValueListenableBuilder<MobileScannerState>(
          valueListenable: _controller,
          builder: (context, estado, _) {
            if (!estado.isRunning) return const SizedBox.shrink();
            return Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: ControleZoom(
                  zoom: _zoom,
                  onZoom: (zoom) => unawaited(_aplicarZoom(zoom)),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  String _mensagemDoErro(MobileScannerException error) {
    switch (error.errorCode) {
      case MobileScannerErrorCode.permissionDenied:
        return 'Sem permissão para usar a câmera. Libere-a nas configurações do aparelho para ler o QR Code.';
      case MobileScannerErrorCode.unsupported:
        return 'Este aparelho não tem uma câmera compatível com a leitura de QR Code.';
      default:
        return 'Não foi possível abrir a câmera.';
    }
  }
}

/// Converte o gesto de pinça em zoom: abrir os dedos até o dobro da distância inicial
/// soma metade do zoom máximo; fechar diminui na mesma proporção. Sempre entre 0 e 1.
double zoomDaPinca(double zoomInicial, double escalaDoGesto) {
  return (zoomInicial + (escalaDoGesto - 1) * 0.5).clamp(0.0, 1.0).toDouble();
}

/// Barra de zoom do leitor: botões de menos/mais e um controle deslizante de 0 a 1.
class ControleZoom extends StatelessWidget {
  /// Quanto cada toque em "-" ou "+" muda o zoom.
  static const passo = 0.1;

  final double zoom;
  final ValueChanged<double> onZoom;

  const ControleZoom({super.key, required this.zoom, required this.onZoom});

  @override
  Widget build(BuildContext context) {
    final atual = zoom.clamp(0.0, 1.0).toDouble();
    return Container(
      decoration: BoxDecoration(
        color: const Color(0x99000000),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Diminuir zoom',
            icon: const Icon(Icons.zoom_out, color: Colors.white),
            onPressed: atual <= 0
                ? null
                : () => onZoom((atual - passo).clamp(0.0, 1.0).toDouble()),
          ),
          Expanded(
            child: Slider(
              value: atual,
              onChanged: onZoom,
              activeColor: Colors.white,
              inactiveColor: const Color(0x66FFFFFF),
              semanticFormatterCallback: (valor) =>
                  'Zoom ${(valor * 100).round()}%',
            ),
          ),
          IconButton(
            tooltip: 'Aumentar zoom',
            icon: const Icon(Icons.zoom_in, color: Colors.white),
            onPressed: atual >= 1
                ? null
                : () => onZoom((atual + passo).clamp(0.0, 1.0).toDouble()),
          ),
        ],
      ),
    );
  }
}

class _ErroCamera extends StatelessWidget {
  final String mensagem;
  final VoidCallback onTentarDeNovo;

  const _ErroCamera({required this.mensagem, required this.onTentarDeNovo});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF0B1D36),
      padding: const EdgeInsets.all(20),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.no_photography, color: Colors.white, size: 40),
          const SizedBox(height: 12),
          Text(
            mensagem,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: Color(0xFFCFE1FB)),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: onTentarDeNovo,
            style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Tentar de novo'),
          ),
        ],
      ),
    );
  }
}
