import 'dart:async';

import 'package:geolocator/geolocator.dart';

/// Posição do celular enviada junto com o QR Code.
class Posicao {
  final double latitude;
  final double longitude;
  final DateTime obtidaEm;

  const Posicao({
    required this.latitude,
    required this.longitude,
    required this.obtidaEm,
  });
}

/// Por que não foi possível obter a posição.
enum FalhaLocalizacao {
  /// GPS / serviço de localização desligado no aparelho.
  servicoDesligado,

  /// A pessoa negou a permissão (pode pedir de novo).
  permissaoNegada,

  /// A pessoa negou para sempre: só nas configurações do aparelho.
  permissaoNegadaParaSempre,

  /// O GPS não respondeu a tempo.
  indisponivel,
}

class LocalizacaoException implements Exception {
  final FalhaLocalizacao falha;

  const LocalizacaoException(this.falha);

  String get message {
    switch (falha) {
      case FalhaLocalizacao.servicoDesligado:
        return 'A localização do celular está desligada. Ative o GPS para ler o QR Code.';
      case FalhaLocalizacao.permissaoNegada:
        return 'Sem permissão de localização não é possível confirmar que você está na catraca.';
      case FalhaLocalizacao.permissaoNegadaParaSempre:
        return 'A permissão de localização foi negada. Libere-a nas configurações do aparelho.';
      case FalhaLocalizacao.indisponivel:
        return 'Não foi possível obter sua localização. Tente em um local com melhor sinal.';
    }
  }

  @override
  String toString() => message;
}

/// Acesso à localização. A tela de leitura recebe esta classe para os testes trocarem por uma falsa.
abstract class LocalizacaoService {
  /// Pede permissão se preciso e devolve a posição atual.
  /// Lança [LocalizacaoException] com mensagem pronta para a tela.
  Future<Posicao> obterPosicao();

  /// Abre as configurações do app (permissão negada para sempre) ou de localização (GPS desligado).
  Future<void> abrirConfiguracoes(FalhaLocalizacao falha);
}

class GeolocatorLocalizacaoService implements LocalizacaoService {
  /// Menos que os 10 s de validade do QR: a posição é pedida antes da leitura,
  /// mas se não houver uma pronta, a leitura não pode esperar mais que isso.
  static const _tempoLimite = Duration(seconds: 8);

  @override
  Future<Posicao> obterPosicao() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocalizacaoException(FalhaLocalizacao.servicoDesligado);
    }

    var permissao = await Geolocator.checkPermission();
    if (permissao == LocationPermission.denied) {
      permissao = await Geolocator.requestPermission();
    }
    if (permissao == LocationPermission.deniedForever) {
      throw const LocalizacaoException(
        FalhaLocalizacao.permissaoNegadaParaSempre,
      );
    }
    if (permissao == LocationPermission.denied ||
        permissao == LocationPermission.unableToDetermine) {
      throw const LocalizacaoException(FalhaLocalizacao.permissaoNegada);
    }

    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: _tempoLimite,
        ),
      );
      return Posicao(
        latitude: p.latitude,
        longitude: p.longitude,
        obtidaEm: DateTime.now(),
      );
    } on TimeoutException {
      throw const LocalizacaoException(FalhaLocalizacao.indisponivel);
    } on LocationServiceDisabledException {
      throw const LocalizacaoException(FalhaLocalizacao.servicoDesligado);
    } on PermissionDeniedException {
      throw const LocalizacaoException(FalhaLocalizacao.permissaoNegada);
    } catch (_) {
      throw const LocalizacaoException(FalhaLocalizacao.indisponivel);
    }
  }

  @override
  Future<void> abrirConfiguracoes(FalhaLocalizacao falha) async {
    if (falha == FalhaLocalizacao.servicoDesligado) {
      await Geolocator.openLocationSettings();
    } else {
      await Geolocator.openAppSettings();
    }
  }
}
