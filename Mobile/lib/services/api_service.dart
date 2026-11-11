import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String _baseUrl = 'https://backend-teste-sic-4s-10.onrender.com/api/v1';
  static const String _tokenKey = 'auth_token';
  static const String _userProfileKey = 'user_profile';

  String? _token;
  String? _userProfile;

  String? get token => _token;
  String? get userProfile => _userProfile;
  bool get isLoggedIn => _token != null;

  Future<void> initialize() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    _userProfile = prefs.getString(_userProfileKey);
  }

  /// Faz login. O perfil (`ADMIN`, `RESIDENT` ou `VISITOR`) vem da resposta da API
  /// e fica em [userProfile]. A API só aceita `email` e `password` no corpo.
  Future<bool> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await http
          .post(
            Uri.parse('$_baseUrl/auth/login'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'email': email, 'password': password}),
          )
          .timeout(const Duration(seconds: 30));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        _token = data['accessToken'] as String;
        _userProfile = (data['user'] as Map<String, dynamic>)['role'] as String;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_tokenKey, _token!);
        await prefs.setString(_userProfileKey, _userProfile!);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  Future<void> logout() async {
    _token = null;
    _userProfile = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userProfileKey);
  }

  /// Lista as autorizações do usuário autenticado (condômino ou visitante).
  /// Lança [ApiException] com mensagem pronta para exibir na tela.
  Future<AuthorizationPage> getMyAuthorizations({
    String? from,
    String? to,
    String? situation,
    int page = 1,
    int pageSize = 20,
  }) async {
    if (_token == null) {
      throw const ApiException(
        'Sessão expirada. Faça login novamente.',
        sessaoExpirada: true,
      );
    }

    final queryParams = <String, String>{
      'page': page.toString(),
      'pageSize': pageSize.toString(),
    };
    if (from != null) queryParams['from'] = from;
    if (to != null) queryParams['to'] = to;
    if (situation != null) queryParams['situation'] = situation;

    final uri = Uri.parse('$_baseUrl/me/authorizations')
        .replace(queryParameters: queryParams);

    final http.Response response;
    try {
      // 30s: o plano gratuito do Render pode demorar para "acordar".
      response = await http
          .get(uri, headers: authHeaders)
          .timeout(const Duration(seconds: 30));
    } on TimeoutException {
      throw const ApiException(
        'O servidor demorou para responder. Tente novamente.',
      );
    } on SocketException {
      throw const ApiException(
        'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
      );
    } on http.ClientException {
      throw const ApiException(
        'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
      );
    }

    if (response.statusCode == 200) {
      try {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final items = (data['data'] as List<dynamic>? ?? [])
            .map((json) => Authorization.fromJson(json as Map<String, dynamic>))
            .toList();
        final meta = data['meta'] as Map<String, dynamic>?;
        final total = (meta?['total'] as num?)?.toInt() ?? items.length;
        return AuthorizationPage(items: items, total: total);
      } catch (_) {
        throw const ApiException('Resposta inesperada do servidor.');
      }
    }

    if (response.statusCode == 401) {
      await logout();
      throw const ApiException(
        'Sessão expirada. Faça login novamente.',
        sessaoExpirada: true,
      );
    }

    if (response.statusCode >= 500) {
      throw const ApiException(
        'O servidor está indisponível no momento. Tente novamente em instantes.',
      );
    }

    throw ApiException(
      'Não foi possível carregar as autorizações (código ${response.statusCode}).',
    );
  }

  // ---------- Usuários e locais ----------

  Future<List<Pessoa>> listarUsuarios(String role) async {
        final body = await _chamar('GET', '/users',
        query: {'role': role, 'pageSize': '100', 'active': 'true'});
    return _extrairLista(body)
        .map((j) => Pessoa.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<void> salvarUsuario({
    String? id,
    required Map<String, dynamic> dados,
  }) async {
    await _chamar(id == null ? 'POST' : 'PATCH',
        id == null ? '/users' : '/users/$id',
        corpo: dados);
  }

  Future<List<Local>> listarLocais() async {
        final body = await _chamar('GET', '/locations',
        query: {'pageSize': '100', 'active': 'true'});
    return _extrairLista(body)
        .map((j) => Local.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<void> salvarLocal({
    String? id,
    required Map<String, dynamic> dados,
  }) async {
    await _chamar(id == null ? 'POST' : 'PATCH',
        id == null ? '/locations' : '/locations/$id',
        corpo: dados);
  }

  List<dynamic> _extrairLista(dynamic body) {
    if (body is List) return body;
    if (body is Map<String, dynamic>) {
      return body['data'] as List<dynamic>? ?? [];
    }
    return [];
  }

  /// Chamada genérica autenticada. Lança [ApiException] com mensagem amigável.
  Future<dynamic> _chamar(
    String metodo,
    String caminho, {
    Map<String, String>? query,
    Map<String, dynamic>? corpo,
  }) async {
    if (_token == null) {
      throw const ApiException(
        'Sessão expirada. Faça login novamente.',
        sessaoExpirada: true,
      );
    }

    final uri =
        Uri.parse('$_baseUrl$caminho').replace(queryParameters: query);
    final http.Response response;
    try {
      final request = http.Request(metodo, uri)..headers.addAll(authHeaders);
      if (corpo != null) request.body = jsonEncode(corpo);
      final streamed =
          await request.send().timeout(const Duration(seconds: 30));
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const ApiException(
        'O servidor demorou para responder. Tente novamente.',
      );
    } on SocketException {
      throw const ApiException(
        'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
      );
    } on http.ClientException {
      throw const ApiException(
        'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
      );
    }

    final status = response.statusCode;
    if (status >= 200 && status < 300) {
      if (response.body.isEmpty) return null;
      try {
        return jsonDecode(response.body);
      } catch (_) {
        throw const ApiException('Resposta inesperada do servidor.');
      }
    }
    if (status == 401) {
      await logout();
      throw const ApiException(
        'Sessão expirada. Faça login novamente.',
        sessaoExpirada: true,
      );
    }
    if (status == 403) {
      throw const ApiException('Você não tem permissão para esta ação.');
    }
    if (status == 400 || status == 409 || status == 422) {
      throw ApiException(
        _mensagemDoErro(response.body) ?? 'Verifique os dados informados.',
      );
    }
    if (status >= 500) {
      throw const ApiException(
        'O servidor está indisponível no momento. Tente novamente em instantes.',
      );
    }
    throw ApiException('Não foi possível concluir a ação (código $status).');
  }

   String? _mensagemDoErro(String body) {
    try {
      final data = jsonDecode(body);
      final erro = data is Map ? data['error'] : null;
      final m = erro is Map ? erro['message'] : null;
      if (m is String && m.isNotEmpty) return m;
    } catch (_) {}
    return null;
  }

  Map<String, String> get authHeaders => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_token',
      };
}

/// Erro de API com mensagem já amigável para o usuário.
class ApiException implements Exception {
  final String message;
  final bool sessaoExpirada;

  const ApiException(this.message, {this.sessaoExpirada = false});

  @override
  String toString() => message;
}

/// Uma página de autorizações + total geral (vem de `meta.total` da API).
class AuthorizationPage {
  final List<Authorization> items;
  final int total;

  const AuthorizationPage({required this.items, required this.total});
}

class Authorization {
  final String id;
  final User user;
  final Location location;
  final String startDate;
  final String endDate;
  final String startTime;
  final String endTime;
  final int? maxUses;
  final int usesCount;
  final String status;
  final String situation;
  final String? cancelReason;
  final String? cancelledAt;

  Authorization({
    required this.id,
    required this.user,
    required this.location,
    required this.startDate,
    required this.endDate,
    required this.startTime,
    required this.endTime,
    required this.maxUses,
    required this.usesCount,
    required this.status,
    required this.situation,
    this.cancelReason,
    this.cancelledAt,
  });

  factory Authorization.fromJson(Map<String, dynamic> json) {
    return Authorization(
      id: json['id'] as String,
      user: User.fromJson(json['user'] as Map<String, dynamic>),
      location: Location.fromJson(json['location'] as Map<String, dynamic>),
      startDate: json['startDate'] as String,
      endDate: json['endDate'] as String,
      startTime: json['startTime'] as String,
      endTime: json['endTime'] as String,
      maxUses: json['maxUses'] as int?,
      usesCount: json['usesCount'] as int? ?? 0,
      status: json['status'] as String? ?? 'ACTIVE',
      situation: json['situation'] as String? ?? 'SCHEDULED',
      cancelReason: json['cancelReason'] as String?,
      cancelledAt: json['cancelledAt'] as String?,
    );
  }

  String get periodoFormatado {
    final inicio = _formatarData(startDate);
    final fim = _formatarData(endDate);
    if (inicio == fim) {
      return '$inicio • ${_formatarHora(startTime)} às ${_formatarHora(endTime)}';
    }
    return '$inicio a $fim • ${_formatarHora(startTime)} às ${_formatarHora(endTime)}';
  }

  String _formatarData(String data) {
    final partes = data.split('-');
    if (partes.length == 3) {
      return '${partes[2]}/${partes[1]}/${partes[0]}';
    }
    return data;
  }

  String _formatarHora(String hora) {
    if (hora.length >= 5) {
      return hora.substring(0, 5);
    }
    return hora;
  }

  Color get situacaoCor {
    switch (situation) {
      case 'VALID':
        return const Color(0xFF1D7A46); // ok
      case 'SCHEDULED':
        return const Color(0xFF2F6FD0); // azul2
      case 'EXPIRED':
        return const Color(0xFF5B6B85); // mudo
      case 'EXHAUSTED':
        return const Color(0xFFB3261E); // erro
      case 'CANCELLED':
        return const Color(0xFFB3261E); // erro
      default:
        return const Color(0xFF5B6B85);
    }
  }

  Color get situacaoFundo {
    switch (situation) {
      case 'VALID':
        return const Color(0xFFE1F4E9); // okFundo
      case 'SCHEDULED':
        return const Color(0xFFE8F1FD); // claro
      case 'EXPIRED':
        return const Color(0xFFE8F1FD); // claro
      case 'EXHAUSTED':
        return const Color(0xFFFBE5E3); // erroFundo
      case 'CANCELLED':
        return const Color(0xFFFBE5E3); // erroFundo
      default:
        return const Color(0xFFE8F1FD);
    }
  }

  String get situacaoTexto {
    switch (situation) {
      case 'VALID':
        return 'Válida';
      case 'SCHEDULED':
        return 'Agendada';
      case 'EXPIRED':
        return 'Expirada';
      case 'EXHAUSTED':
        return 'Esgotada';
      case 'CANCELLED':
        return 'Cancelada';
      default:
        return situation;
    }
  }
}

class User {
  final String id;
  final String name;
  final String role;

  User({required this.id, required this.name, required this.role});

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      name: json['name'] as String,
      role: json['role'] as String,
    );
  }
}

class Location {
  final String id;
  final String name;
  final String type;

  Location({required this.id, required this.name, required this.type});

  factory Location.fromJson(Map<String, dynamic> json) {
    return Location(
      id: json['id'] as String,
      name: json['name'] as String,
      type: json['type'] as String,
    );
  }
}

class Pessoa {
  final String id;
  final String name;
  final String email;
  final String? nfcUid;

  Pessoa({
    required this.id,
    required this.name,
    required this.email,
    this.nfcUid,
  });

  factory Pessoa.fromJson(Map<String, dynamic> json) {
    return Pessoa(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String? ?? '',
      nfcUid: json['nfcUid'] as String?,
    );
  }
}

class Local {
  final String id;
  final String name;
  final String type;
  final String? address;
  final double? latitude;
  final double? longitude;
  final String? parentId;

  Local({
    required this.id,
    required this.name,
    required this.type,
    this.address,
    this.latitude,
    this.longitude,
    this.parentId,
  });

  factory Local.fromJson(Map<String, dynamic> json) {
    return Local(
      id: json['id'] as String,
      name: json['name'] as String,
      type: json['type'] as String,
      address: json['address'] as String?,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      parentId: json['parentId'] as String?,
    );
  }
}