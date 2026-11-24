import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Câmera lendo QR Codes. Só fica ligada enquanto [ativo] for verdadeiro: a tela de leitura
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

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MobileScanner(
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
