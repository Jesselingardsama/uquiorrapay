// Configuração pública do site Uquiorrapay.
// A chave abaixo é a chave PÚBLICA do Supabase (pode estar no navegador).
// A segurança dos dados é garantida pelas regras (RLS) na base de dados.
export const CONFIG = {
  SUPABASE_URL: "https://dzwbccqqvcmqmmqtdgzw.supabase.co",
  SUPABASE_KEY: "sb_publishable_ZhMujtcR7aD3y6AxiDJ-AA_fQhAz8iX",
  // Mudar para true depois de activar o Google em Supabase → Authentication → Providers
  GOOGLE_LOGIN: false,
  // Categorias agrupadas (o nome em português é o que fica guardado na base de dados)
  CATEGORY_GROUPS: [
    ["Negócios e dinheiro", "Business & money", ["Negócios", "Empreendedorismo digital", "Marketing", "Vendas", "Finanças", "Direito"]],
    ["Tecnologia e criatividade", "Tech & creativity", ["Tecnologia", "Programação", "Engenharia", "Design", "Fotografia e vídeo", "Música e artes"]],
    ["Saúde e bem-estar", "Health & wellness", ["Saúde e fitness", "Emagrecimento e dieta", "Nutrição", "Desporto", "Beleza e estética", "Moda"]],
    ["Educação e vida pessoal", "Education & personal life", ["Idiomas", "Educação e concursos", "Desenvolvimento pessoal", "Relacionamentos e família", "Espiritualidade"]],
    ["Casa, campo e lazer", "Home, farming & leisure", ["Culinária e gastronomia", "Agricultura e pecuária", "Casa e construção", "Animais e plantas", "Hobbies e lazer", "Outros"]],
  ],
  PRICE_MIN: 79,
  PRICE_MAX: 250000,
  CURRENCIES: ["MZN", "USD", "BRL", "ZAR", "EUR"],
};
CONFIG.CATEGORIES = CONFIG.CATEGORY_GROUPS.flatMap((g) => g[2]);
