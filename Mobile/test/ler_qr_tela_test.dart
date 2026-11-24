import 'dart:async';

import 'package:controle_acesso/services/api_service.dart';
import 'package:controle_acesso/services/localizacao_service.dart';
import 'package:controle_acesso/telas/ler_qr_tela.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const codigoValido = '7KQ2MX9DPV4TRH0ZB6WNCJ8EA';

class ChamadaQr {
  final String codigo;
  final double latitude;
  final double longitude;

  ChamadaQr(this.codigo, this.latitude, this.longitude);
}

/// API falsa: guarda as chamadas e responde o que o teste mandar.
class ApiFalsa extends ApiService {
  final chamadas = <ChamadaQr>[];
  Future<DecisaoAcesso> Function() resposta = () async => liberado;

  static const liberado = DecisaoAcesso(
    liberado: true,
    motivo: null,
    mensagem: 'Acesso liberado',
  );

  @override
  Future<void> acordarServidor() async {}

  @override
  Future<DecisaoAcesso> validarQrCode({
    required String codigo,
    required double latitude,
    required double longitude,
  }) {
    chamadas.add(ChamadaQr(codigo, latitude, longitude));
    return resposta();
  }
}

class LocalizacaoFalsa implements LocalizacaoService {
  LocalizacaoException? falha;
  int pedidos = 0;

  @override
  Future<Posicao> obterPosicao() async {
    pedidos++;
    final f = falha;
    if (f != null) throw f;
    return Posicao(
      latitude: -23.30501,
      longitude: -45.96581,
      obtidaEm: DateTime.now(),
    );
  }

  @override
  Future<void> abrirConfiguracoes(FalhaLocalizacao falha) async {}
}

/// Leitor falso: em vez da câmera, o teste chama [ler] com o texto "decodificado".
class LeitorFalso {
  ValueChanged<String>? _onCodigo;
  bool? ativo;

  Widget build(BuildContext context, bool ativo, ValueChanged<String> onCodigo) {
    this.ativo = ativo;
    _onCodigo = onCodigo;
    return const SizedBox.expand();
  }

  void ler(String texto) => _onCodigo!(texto);
}

void main() {
  late ApiFalsa api;
  late LocalizacaoFalsa localizacao;
  late LeitorFalso leitor;
  late int sessoesExpiradas;

  setUp(() {
    api = ApiFalsa();
    localizacao = LocalizacaoFalsa();
    leitor = LeitorFalso();
    sessoesExpiradas = 0;
  });

  Future<void> abrirTela(WidgetTester tester, {bool ativa = true}) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LerQrTela(
            apiService: api,
            ativa: ativa,
            onSessaoExpirada: () => sessoesExpiradas++,
            localizacao: localizacao,
            leitorBuilder: leitor.build,
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('envia o código lido com a posição e mostra acesso liberado', (
    tester,
  ) async {
    await abrirTela(tester);
    expect(find.text('Localização pronta.'), findsOneWidget);

    leitor.ler(codigoValido);
    await tester.pumpAndSettle();

    expect(api.chamadas, hasLength(1));
    expect(api.chamadas.single.codigo, codigoValido);
    expect(api.chamadas.single.latitude, -23.30501);
    expect(api.chamadas.single.longitude, -45.96581);
    expect(find.text('Acesso liberado'), findsOneWidget);

    await tester.tap(find.text('Voltar'));
    await tester.pumpAndSettle();
    expect(find.text('Ler QR Code'), findsOneWidget);
    expect(leitor.ativo, isTrue);
  });

  testWidgets('mostra o motivo da negação', (tester) async {
    api.resposta = () async => const DecisaoAcesso(
      liberado: false,
      motivo: 'OUT_OF_RANGE',
      mensagem: 'Longe da catraca',
      distanciaMetros: 340,
    );
    await abrirTela(tester);

    leitor.ler(codigoValido);
    await tester.pumpAndSettle();

    expect(find.text('Acesso negado'), findsOneWidget);
    expect(find.textContaining('340 m da catraca'), findsOneWidget);
  });

  testWidgets('QR que não é de terminal não vai ao backend', (tester) async {
    await abrirTela(tester);

    leitor.ler('https://exemplo.com/qualquer-coisa');
    await tester.pump();

    expect(api.chamadas, isEmpty);
    expect(
      find.text('Este QR Code não é de um terminal de acesso.'),
      findsOneWidget,
    );
  });

  testWidgets('não reenvia enquanto aguarda a resposta nem o mesmo código depois', (
    tester,
  ) async {
    final resposta = Completer<DecisaoAcesso>();
    api.resposta = () => resposta.future;
    await abrirTela(tester);

    leitor.ler(codigoValido);
    await tester.pump();
    expect(find.text('Validando acesso...'), findsOneWidget);
    expect(leitor.ativo, isFalse, reason: 'câmera pausada enquanto valida');

    leitor.ler(codigoValido);
    leitor.ler(codigoValido);
    await tester.pump();
    expect(api.chamadas, hasLength(1));

    resposta.complete(ApiFalsa.liberado);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Voltar'));
    await tester.pumpAndSettle();

    // O código é de uso único: lido de novo (ainda na tela do terminal), é ignorado.
    leitor.ler(codigoValido);
    await tester.pumpAndSettle();
    expect(api.chamadas, hasLength(1));
  });

  testWidgets('permissão de localização negada impede o envio', (tester) async {
    localizacao.falha = const LocalizacaoException(
      FalhaLocalizacao.permissaoNegadaParaSempre,
    );
    await abrirTela(tester);

    leitor.ler(codigoValido);
    await tester.pumpAndSettle();

    expect(api.chamadas, isEmpty);
    expect(
      find.text(
        'A permissão de localização foi negada. Libere-a nas configurações do aparelho.',
      ),
      findsOneWidget,
    );
    expect(find.text('Abrir configurações'), findsOneWidget);
  });

  testWidgets('GPS desligado mostra o aviso', (tester) async {
    localizacao.falha = const LocalizacaoException(
      FalhaLocalizacao.servicoDesligado,
    );
    await abrirTela(tester);

    expect(
      find.textContaining('A localização do celular está desligada'),
      findsOneWidget,
    );
  });

  testWidgets('erro 400 mostra a mensagem e deixa ler de novo', (tester) async {
    api.resposta = () async =>
        throw const ApiException('Verifique os dados informados.');
    await abrirTela(tester);

    leitor.ler(codigoValido);
    await tester.pumpAndSettle();

    expect(find.text('Verifique os dados informados.'), findsOneWidget);
    expect(leitor.ativo, isTrue);
  });

  testWidgets('sessão expirada volta ao login', (tester) async {
    api.resposta = () async => throw const ApiException(
      'Sessão expirada. Faça login novamente.',
      sessaoExpirada: true,
    );
    await abrirTela(tester);

    leitor.ler(codigoValido);
    await tester.pumpAndSettle();

    expect(sessoesExpiradas, 1);
  });

  testWidgets('aba escondida não liga câmera nem GPS', (tester) async {
    await abrirTela(tester, ativa: false);

    expect(leitor.ativo, isNull);
    expect(localizacao.pedidos, 0);
  });
}
