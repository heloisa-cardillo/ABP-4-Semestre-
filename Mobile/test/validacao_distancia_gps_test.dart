import 'dart:convert';

import 'package:controle_acesso/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('DecisaoAcesso (regra dos 100 m)', () {
    test('OUT_OF_RANGE com distância mostra a distância e o limite', () {
      final decisao = DecisaoAcesso.fromJson({
        'result': 'DENIED',
        'denyReason': 'OUT_OF_RANGE',
        'message': 'Longe da catraca',
        'distanceMeters': 250.4,
      });

      expect(decisao.liberado, isFalse);
      expect(decisao.motivo, 'OUT_OF_RANGE');
      expect(decisao.motivoTexto, contains('250 m'));
      expect(decisao.motivoTexto, contains('100 m'));
    });

    test('OUT_OF_RANGE sem distância usa a mensagem genérica', () {
      final decisao = DecisaoAcesso.fromJson({
        'result': 'DENIED',
        'denyReason': 'OUT_OF_RANGE',
        'message': 'Longe da catraca',
      });

      expect(decisao.distanciaMetros, isNull);
      expect(
        decisao.motivoTexto,
        'Não foi possível confirmar que você está perto da catraca.',
      );
    });

    test('acesso liberado não tem motivo de negação', () {
      final decisao = DecisaoAcesso.fromJson({
        'result': 'GRANTED',
        'denyReason': null,
        'message': 'Acesso liberado',
        'distanceMeters': 12.0,
      });

      expect(decisao.liberado, isTrue);
      expect(decisao.motivo, isNull);
    });
  });

  group('ApiService.validarQrCode', () {
    const codigo = '0123456789ABCDEFGHJKMNPQR';

    setUp(() {
      SharedPreferences.setMockInitialValues({'auth_token': 'token-teste'});
    });

    test('o código de exemplo tem o formato do QR do terminal', () {
      expect(qrCodeTerminalPattern.hasMatch(codigo), isTrue);
    });

    test('envia code, latitude e longitude para POST /access/qr', () async {
      late http.Request requisicao;
      final client = MockClient((request) async {
        requisicao = request;
        return http.Response(
          jsonEncode({
            'result': 'GRANTED',
            'denyReason': null,
            'message': 'Acesso liberado',
          }),
          200,
        );
      });
      final api = ApiService(client: client);
      await api.initialize();

      final decisao = await api.validarQrCode(
        codigo: codigo,
        latitude: -23.3045,
        longitude: -45.9658,
      );

      expect(requisicao.method, 'POST');
      expect(requisicao.url.path, endsWith('/access/qr'));
      expect(requisicao.headers['Authorization'], 'Bearer token-teste');
      expect(jsonDecode(requisicao.body), {
        'code': codigo,
        'latitude': -23.3045,
        'longitude': -45.9658,
      });
      expect(decisao.liberado, isTrue);
    });

    test('acesso negado por distância não lança erro', () async {
      final client = MockClient((_) async => http.Response(
            jsonEncode({
              'result': 'DENIED',
              'denyReason': 'OUT_OF_RANGE',
              'message': 'Longe da catraca',
              'distanceMeters': 180.0,
            }),
            200,
          ));
      final api = ApiService(client: client);
      await api.initialize();

      final decisao = await api.validarQrCode(
        codigo: codigo,
        latitude: -23.31,
        longitude: -45.97,
      );

      expect(decisao.liberado, isFalse);
      expect(decisao.motivo, 'OUT_OF_RANGE');
    });
  });
}