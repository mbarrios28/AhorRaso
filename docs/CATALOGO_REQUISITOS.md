# Catálogo de Requisitos y Clasificación MoSCoW - Proyecto AhorRaso

## 1. Descripción del Proyecto

AhorRaso es una aplicación de gestión financiera personal diseñada para jóvenes y universitarios[cite: 3, 5]. El proyecto busca resolver la ineficiencia, la falta de control presupuestal y los errores de cálculo asociados a la gestión manual de ingresos y gastos[cite: 1]. A través de una interfaz rápida, intuitiva y automatizada, AhorRaso permite a los usuarios registrar sus movimientos en tiempo real, visualizar indicadores financieros clave en menos de 3 segundos, recibir alertas proactivas ante posibles sobregiros y proyectar sus metas de ahorro sin descuidar sus finanzas cotidianas[cite: 1, 3].

---

## 2. Requisitos Funcionales (RF)

| ID | Nombre del Requisito | Descripción | Prioridad MoSCoW | Justificación de Negocio |
| :--- | :--- | :--- | :--- | :--- |
| **RF-001** | Registrar ingresos | El sistema debe permitir al usuario registrar ingresos indicando monto, fecha, fuente y categoría. | **Must Have** | Base fundamental para calcular el saldo disponible real del usuario. |
| **RF-002** | Registrar gastos | El sistema debe permitir registrar gastos con monto, fecha, categoría, establecimiento y método de pago (efectivo o digital). | **Must Have** | Núcleo del control financiero; sin esto no se puede monitorear el destino del dinero. |
| **RF-003** | Registrar gastos por voz | El sistema debe permitir dictar un gasto y convertirlo automáticamente en un registro sin necesidad de escribir. | **Must Have** | Elimina la fricción del registro manual inmediato cuando el usuario realiza compras en el punto de venta. |
| **RF-004** | Categorizar movimientos | El sistema debe permitir asignar una categoría a cada ingreso o gasto (alimentación, transporte, entretenimiento, servicios, etc.). | **Must Have** | Insumo obligatorio para estructurar presupuestos y analizar consumo por áreas. |
| **RF-005** | Gestionar categorías | El sistema debe permitir crear, editar y eliminar categorías personalizadas según las necesidades del usuario. | **Must Have** | Ofrece flexibilidad para adaptarse a la estructura de gastos propia de cada perfil. |
| **RF-006** | Establecer presupuesto por categoría | El sistema debe permitir definir un límite de gasto por categoría y por periodo (semanal, quincenal o mensual). | **Must Have** | Permite una gestión proactiva para evitar el sobregiro en áreas específicas. |
| **RF-007** | Definir metas de ahorro | El sistema debe permitir crear metas de ahorro con monto objetivo y fecha estimada. | **Should Have** | Agrega valor clave para incentivar el hábito de ahorro orientado a objetivos reales. |
| **RF-008** | Visualizar dashboard financiero | El sistema debe mostrar un resumen con saldo disponible, gastos por categoría, progreso de metas y proyección hasta fin de mes. | **Must Have** | Centro de control principal que entrega visibilidad inmediata del estado económico. |
| **RF-009** | Consultar historial de movimientos | El sistema debe permitir listar y filtrar ingresos y gastos por fecha, categoría, monto o establecimiento. | **Must Have** | Permite auditoría y revisión periódica de gastos pasados para el ajuste de hábitos. |
| **RF-010** | Configurar alertas y umbrales | El sistema debe permitir configurar alertas según porcentajes del presupuesto (ej. 50%, 80% o 100%). | **Must Have** | Opcion de personalización indispensable para activar la prevención de sobregiro. |
| **RF-011** | Recibir alertas de presupuesto | El sistema debe enviar notificaciones cuando el usuario se acerque o supere un umbral configurado. | **Must Have** | Automatización proactiva que advierte al usuario antes de incurrir en pérdidas o déficit. |
| **RF-012** | Analizar patrones de consumo | El sistema debe analizar los hábitos de gasto del usuario para detectar comportamientos repetidos o cambios en el tiempo. | **Could Have** | Funcionalidad analítica avanzada que aporta valor estratégico pero no bloquea el MVP. |
| **RF-013** | Generar recomendaciones de ahorro | El sistema debe sugerir acciones concretas para reducir gastos en áreas prescindibles. | **Could Have** | Complemento inteligente para asesorar al usuario sobre dónde recortar egresos. |
| **RF-014** | Simular proyección de metas | El sistema debe calcular el tiempo estimado para alcanzar una meta según el ahorro periódico del usuario. | **Could Have** | Herramienta de estimación que refuerza la sección de metas de ahorro. |
| **RF-015** | Priorizar deudas | El sistema debe recomendar qué deuda pagar primero para optimizar el dinero disponible. | **Could Have** | Módulo de soporte financiero de valor secundario dentro del alcance inicial. |
| **RF-016** | Acceder a educación financiera | El sistema debe ofrecer módulos, consejos o cursos sobre ahorro, inversión y manejo de deudas. | **Could Have** | Contenido informativo complementario que amplía el impacto didáctico. |
| **RF-017** | Generar reporte por establecimiento | El sistema debe mostrar un desglose de gastos agrupados por comercio o establecimiento. | **Won't Have** | Postpuesto para futuras versiones por no ser crítico frente a la categorización general. |
| **RF-018** | Gestionar seguridad y acceso | El sistema debe permitir autenticación mediante contraseña, PIN o biometría, y proteger los datos financieros del usuario. | **Could Have** | Mecanismo de autenticación avanzada reubicado para agilizar la entrega del MVP básico. |
| **RF-019** | Enviar mensajes motivacionales o recompensas | El sistema debe mostrar mensajes de motivación o incentivos cuando el usuario cumpla metas o no retire sus ahorros antes de tiempo. | **Could Have** | Módulo de gamificación no esencial para la lógica financiera pura. |
| **RF-020** | Restringir transacciones al superar presupuesto | El sistema podría bloquear o cancelar transacciones si se supera el presupuesto fijado. | **Won't Have** | Excluido del alcance actual por restricciones técnicas e invasividad operativa. |
| **RF-021** | Integración con API bancaria | El sistema podrá conectarse a APIs de entidades bancarias para importar automáticamente transacciones y saldos, previo consentimiento del usuario. | **Won't Have** | Excluido por complejidad regulatoria y legal fuera del marco temporal del proyecto. |

---

## 3. Requisitos No Funcionales (RNF)

| ID | Nombre del Requisito | Descripción | Prioridad MoSCoW | Justificación de Calidad |
| :--- | :--- | :--- | :--- | :--- |
| **RNF-001** | Usabilidad | El sistema debe permitir que un usuario registre y consulte sus movimientos financieros de forma sencilla, con una interfaz clara y comprensible. | **Must Have** | Indispensable para evitar la fricción que causaba la gestión manual previa. |
| **RNF-002** | Seguridad de la información | El sistema debe proteger los datos financieros mediante autenticación segura y mecanismos de protección contra accesos no autorizados. | **Must Have** | Garantiza la integridad de la información confidencial de ingresos y gastos. |
| **RNF-003** | Rendimiento | El sistema debe responder a las acciones principales del usuario en un tiempo máximo de 3 segundos bajo condiciones normales de uso. | **Must Have** | Requisito clave para garantizar que la app sea utilizable rápidamente en puntos de venta. |
| **RNF-004** | Disponibilidad | El sistema debe encontrarse disponible para los usuarios al menos el 99 % del tiempo mensual, excluyendo mantenimientos programados. | **Should Have** | Garantiza la continuidad operativa cuando el usuario requiera hacer compras imprevistas. |
| **RNF-005** | Privacidad | El sistema debe garantizar que cada usuario únicamente pueda consultar y modificar su propia información financiera. | **Must Have** | Asegura el aislamiento estricto de cuentas y datos personales por legislación y ética. |
| **RNF-006** | Compatibilidad | La aplicación debe funcionar correctamente en los principales navegadores web modernos y adaptarse a dispositivos móviles, tablets y computadoras. | **Should Have** | Permite la flexibilidad multitarea y el acceso desde cualquier canal. |
| **RNF-007** | Escalabilidad | El sistema debe permitir incrementar progresivamente la cantidad de usuarios y transacciones sin requerir una modificación completa de la arquitectura. | **Should Have** | Prepara la arquitectura para crecimiento de usuarios o la incorporación de módulos de IA. |
| **RNF-008** | Mantenibilidad | El código del sistema debe estar organizado de manera modular y documentada para facilitar la corrección de errores y el mantenimiento. | **Should Have** | Permite una evolución sostenible del código a lo largo de los distintos Sprints. |
| **RNF-009** | Confiabilidad de los datos | El sistema debe validar los datos ingresados y evitar registros inconsistentes o duplicados de ingresos y gastos. | **Must Have** | Evita discrepancias de saldos y errores de cálculo que arruinen la confianza del usuario. |
| **RNF-010** | Configurabilidad de notificaciones | Las notificaciones deben poder configurarse según los umbrales definidos por el usuario y limitar su frecuencia para evitar avisos excesivos. | **Should Have** | Previene la saturación o molestia por SPAM de alertas push en el teléfono. |
| **RNF-011** | Accesibilidad | La interfaz debe utilizar textos legibles, controles claramente identificables y mensajes comprensibles para personas con diferente experiencia tecnológica. | **Should Have** | Maximiza la tasa de adopción del sistema por parte de cualquier tipo de perfil. |
| **RNF-012** | Recuperación de información | El sistema debe realizar copias de seguridad periódicas de la información financiera y permitir su recuperación ante fallos del sistema. | **Must Have** | Protege los registros históricos del usuario contra caídas o fallos de infraestructura. |

---

## 4. Resumen de Distribución MoSCoW

### Requisitos Funcionales (21 Total)
* **Must Have (10):** RF-001, RF-002, RF-003, RF-004, RF-005, RF-006, RF-008, RF-009, RF-010, RF-011
* **Should Have (1):** RF-007
* **Could Have (7):** RF-012, RF-013, RF-014, RF-015, RF-016, RF-018, RF-019
* **Won't Have (3):** RF-017, RF-020, RF-021

### Requisitos No Funcionales (12 Total)
* **Must Have (6):** RNF-001, RNF-002, RNF-003, RNF-005, RNF-009, RNF-012
* **Should Have (6):** RNF-004, RNF-006, RNF-007, RNF-008, RNF-010, RNF-011
* **Could Have (0)**
* **Won't Have (0)**