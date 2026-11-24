import 'package:controle_acesso/services/acessibilidade_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('começa em 100% e respeita os limites', () async {
    final s = AcessibilidadeService();
    await s.carregar();
    expect(s.escala, 1.0);
    expect(s.podeDiminuir, isFalse);

    for (var i = 0; i < 10; i++) {
      await s.aumentar();
    }
    expect(s.escala, 1.5);
    expect(s.podeAumentar, isFalse);
  });

  test('lembra a escolha depois de reabrir o app', () async {
    final s = AcessibilidadeService();
    await s.aumentar();

    final outro = AcessibilidadeService();
    await outro.carregar();
    expect(outro.escala, 1.15);
  });
}