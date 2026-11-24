import 'dart:convert';

import 'package:controle_acesso/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const codigoValido = '7KQ2MX9DPV4TRH0ZB6WNCJ8EA';

http.Response jsonResponse(Object body, int status) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

Future<ApiService> apiLogada(MockClient client) async {
  SharedPreferences.setMockInitialValues({
    'auth_token': 'token-teste',
    'user_profile': 'RESIDENT',
  });
  final api = ApiService(client: client);
  await api.initialize();
  return api;
}

void main() {
  group('validarQrCode', () {
    test('envia código e posição e devolve acesso liberado', () async {
      late http.Request enviado;
      final api = await apiLogada(
        MockClient((request) async {
          enviado = request;
          return jsonResponse({
            'result': 'GRANTED',
            'denyReason': null,
            'message': 'Acesso liberado',
            'eventId': '00000000-0000-0000-0000-000000000000',
            'distanceMeters': 12.4,
          }, 200);
        }),
      );

      final decisao = await api.validarQrCode(
        codigo: codigoValido,
        latitude: -23.30501,
        longitude: -45.96581,
      );

      expect(enviado.method, 'POST');
      expect(enviado.url.path, '/api/v1/access/qr');
      expect(enviado.headers['Authorization'], 'Bearer token-teste');
      expect(jsonDecode(enviado.body), {
        'code': codigoValido,
        'latitude': -23.30501,
        'longitude': -45.96581,
      });
      expect(decisao.liberado, isTrue);
      expect(decisao.motivo, isNull);
      expect(decisao.distanciaMetros, 12.4);
    });

    test('acesso negado vem como decisão, não como erro', () async {
      final api = await apiLogada(
        MockClient(
          (_) async => jsonResponse({
            'result': 'DENIED',
            'denyReason': 'OUT_OF_RANGE',
            'message': 'Longe da catraca',
            'eventId': '00000000-0000-0000-0000-000000000000',
            'distanceMeters': 250.7,
          }, 200),
        ),
      );

      final decisao = await api.validarQrCode(
        codigo: codigoValido,
        latitude: 0,
        longitude: 0,
      );

      expect(decisao.liberado, isFalse);
      expect(decisao.motivo, 'OUT_OF_RANGE');
      expect(decisao.motivoTexto, contains('251 m'));
    });

    test('400 vira ApiException com a mensagem do backend', () async {
      final api = await apiLogada(
        MockClient(
          (_) async => jsonResponse({
            'error': {
              'code': 'VALIDATION_ERROR',
              'message': 'Este QR Code não é de um terminal de acesso.',
            },
          }, 400),
        ),
      );

      expect(
        () => api.validarQrCode(codigo: 'X', latitude: 0, longitude: 0),
        throwsA(
          isA<ApiException>()
              .having((e) => e.sessaoExpirada, 'sessaoExpirada', isFalse)
              .having(
                (e) => e.message,
                'message',
                'Este QR Code não é de um terminal de acesso.',
              ),
        ),
      );
    });

    test('401 encerra a sessão', () async {
      final api = await apiLogada(
        MockClient((_) async => jsonResponse({}, 401)),
      );

      await expectLater(
        api.validarQrCode(codigo: codigoValido, latitude: 0, longitude: 0),
        throwsA(
          isA<ApiException>().having(
            (e) => e.sessaoExpirada,
            'sessaoExpirada',
            isTrue,
          ),
        ),
      );
      expect(api.isLoggedIn, isFalse);
    });
  });

  test('formato do QR igual ao do backend', () {
    expect(qrCodeTerminalPattern.hasMatch(codigoValido), isTrue);
    expect(qrCodeTerminalPattern.hasMatch(codigoValido.toLowerCase()), isFalse);
    // I, L, O e U não existem no base32 Crockford.
    expect(qrCodeTerminalPattern.hasMatch('IKQ2MX9DPV4TRH0ZB6WNCJ8EA'), isFalse);
    expect(qrCodeTerminalPattern.hasMatch('$codigoValido\n'), isFalse);
    expect(qrCodeTerminalPattern.hasMatch('https://exemplo.com'), isFalse);
  });
}
