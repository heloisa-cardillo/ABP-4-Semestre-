import 'package:flutter/material.dart';

import '../tema.dart';

class CriarAutorizacaoTela extends StatefulWidget {
  const CriarAutorizacaoTela({super.key});

  @override
  State<CriarAutorizacaoTela> createState() => _CriarAutorizacaoTelaState();
}

class _CriarAutorizacaoTelaState extends State<CriarAutorizacaoTela> {
  final _dataInicio = TextEditingController();
  final _dataTermino = TextEditingController();
  final _horarioInicial = TextEditingController();
  final _horarioFinal = TextEditingController();

  @override
  void dispose() {
    _dataInicio.dispose();
    _dataTermino.dispose();
    _horarioInicial.dispose();
    _horarioFinal.dispose();
    super.dispose();
  }

  Widget _rotulo(String texto) {
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 6),
      child: Text(
        texto,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.bold,
          color: Cores.azul,
        ),
      ),
    );
  }

  Widget _seletor(String hint) {
    return DropdownButtonFormField<String>(
      isExpanded: true,
      hint: Text(hint),
      items: const [],
      onChanged: (_) {},
    );
  }

  Future<void> _escolherData(TextEditingController controller) async {
    final agora = DateTime.now();
    final data = await showDatePicker(
      context: context,
      initialDate: agora,
      firstDate: DateTime(agora.year - 1),
      lastDate: DateTime(agora.year + 5),
    );
    if (data == null) return;
    final dia = data.day.toString().padLeft(2, '0');
    final mes = data.month.toString().padLeft(2, '0');
    controller.text = '$dia/$mes/${data.year}';
  }

  Future<void> _escolherHorario(TextEditingController controller) async {
    final horario = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (horario == null || !mounted) return;
    controller.text = horario.format(context);
  }

  Widget _campo(TextEditingController controller, VoidCallback aoTocar) {
    return TextField(
      controller: controller,
      readOnly: true,
      onTap: aoTocar,
      style: const TextStyle(fontSize: 16, color: Cores.texto),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: Cores.azul,
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
          child: const SafeArea(
            bottom: false,
            child: Text(
              'Criar autorização',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _rotulo('Pessoa autorizada'),
                _seletor('Selecione a pessoa'),
                _rotulo('Local de acesso'),
                _seletor('Selecione o local'),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _rotulo('Data de início'),
                          _campo(_dataInicio, () => _escolherData(_dataInicio)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _rotulo('Data de término'),
                          _campo(
                            _dataTermino,
                            () => _escolherData(_dataTermino),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _rotulo('Horário inicial'),
                          _campo(
                            _horarioInicial,
                            () => _escolherHorario(_horarioInicial),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _rotulo('Horário final'),
                          _campo(
                            _horarioFinal,
                            () => _escolherHorario(_horarioFinal),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                _rotulo('Número de utilizações'),
                const TextField(
                  keyboardType: TextInputType.number,
                  style: TextStyle(fontSize: 16, color: Cores.texto),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () {},
                  child: const Text('Criar autorização'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
