import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Guarda o tamanho da fonte escolhido pela pessoa e avisa o app quando muda.
class AcessibilidadeService extends ChangeNotifier {
  static const _chave = 'escala_fonte';
  static const niveis = [1.0, 1.15, 1.3, 1.5];

  int _indice = 0;

  double get escala => niveis[_indice];
  bool get podeAumentar => _indice < niveis.length - 1;
  bool get podeDiminuir => _indice > 0;

  Future<void> carregar() async {
    final prefs = await SharedPreferences.getInstance();
    _indice = (prefs.getInt(_chave) ?? 0).clamp(0, niveis.length - 1);
    notifyListeners();
  }

  Future<void> aumentar() => _mudar(_indice + 1);
  Future<void> diminuir() => _mudar(_indice - 1);

  Future<void> _mudar(int novo) async {
    if (novo < 0 || novo >= niveis.length || novo == _indice) return;
    _indice = novo;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_chave, _indice);
  }
}

/// Instância única usada pelo app inteiro.
final acessibilidade = AcessibilidadeService();