import 'package:controle_acesso/widgets/leitor_qr_camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<List<double>> montarControle(WidgetTester tester, double zoom) async {
  final pedidos = <double>[];
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 320,
            child: ControleZoom(zoom: zoom, onZoom: pedidos.add),
          ),
        ),
      ),
    ),
  );
  return pedidos;
}

void main() {
  group('zoomDaPinca', () {
    test('sem variação no gesto mantém o zoom', () {
      expect(zoomDaPinca(0.3, 1), closeTo(0.3, 1e-9));
    });

    test('abrir os dedos aumenta o zoom', () {
      expect(zoomDaPinca(0, 2), closeTo(0.5, 1e-9));
      expect(zoomDaPinca(0.2, 1.4), closeTo(0.4, 1e-9));
    });

    test('fechar os dedos diminui o zoom', () {
      expect(zoomDaPinca(0.5, 0.6), closeTo(0.3, 1e-9));
    });

    test('fica sempre entre 0 e 1', () {
      expect(zoomDaPinca(0.9, 5), 1);
      expect(zoomDaPinca(0.1, 0.1), 0);
    });
  });

  group('ControleZoom', () {
    testWidgets('"+" aumenta o zoom em um passo', (tester) async {
      final pedidos = await montarControle(tester, 0.2);

      await tester.tap(find.byTooltip('Aumentar zoom'));

      expect(pedidos.single, closeTo(0.3, 1e-9));
    });

    testWidgets('"-" diminui o zoom em um passo', (tester) async {
      final pedidos = await montarControle(tester, 0.5);

      await tester.tap(find.byTooltip('Diminuir zoom'));

      expect(pedidos.single, closeTo(0.4, 1e-9));
    });

    testWidgets('sem zoom, "-" fica desabilitado', (tester) async {
      final pedidos = await montarControle(tester, 0);

      final botao = tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, Icons.zoom_out),
      );
      expect(botao.onPressed, isNull);
      await tester.tap(find.byTooltip('Diminuir zoom'));
      expect(pedidos, isEmpty);
    });

    testWidgets('no zoom máximo, "+" fica desabilitado', (tester) async {
      await montarControle(tester, 1);

      final botao = tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, Icons.zoom_in),
      );
      expect(botao.onPressed, isNull);
    });

    testWidgets('"+" perto do máximo não passa de 1', (tester) async {
      final pedidos = await montarControle(tester, 0.95);

      await tester.tap(find.byTooltip('Aumentar zoom'));

      expect(pedidos.single, 1);
    });

    testWidgets('arrastar o controle deslizante pede um zoom maior',
        (tester) async {
      final pedidos = await montarControle(tester, 0);

      await tester.drag(find.byType(Slider), const Offset(100, 0));

      expect(pedidos, isNotEmpty);
      expect(pedidos.last, greaterThan(0));
      expect(pedidos.last, lessThanOrEqualTo(1));
    });

    testWidgets('o controle deslizante mostra o zoom atual', (tester) async {
      await montarControle(tester, 0.7);

      expect(tester.widget<Slider>(find.byType(Slider)).value, 0.7);
    });
  });
}
