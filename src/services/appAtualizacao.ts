interface AtualizacaoExecutada {
  createdAt?: Date | string | number | null;
  isEnabled?: boolean;
  isEmbeddedLaunch?: boolean;
}

export interface ResumoAtualizacaoApp {
  texto: string;
  detalhe?: string;
}

const TIME_ZONE_APP = 'America/Sao_Paulo';

const normalizarData = (valor?: Date | string | number | null) => {
  if (!valor) return null;

  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isFinite(data.getTime()) ? data : null;
};

export const formatarDataAtualizacaoApp = (valor?: Date | string | number | null) => {
  const data = normalizarData(valor);
  if (!data) return null;

  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE_APP,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(data);

  const porTipo = partes.reduce<Record<string, string>>((acc, parte) => {
    if (parte.type !== 'literal') acc[parte.type] = parte.value;
    return acc;
  }, {});

  const { day, month, year, hour, minute } = porTipo;
  if (!day || !month || !year || !hour || !minute) return null;

  return `${day}/${month}/${year} às ${hour}:${minute}`;
};

export const obterResumoAtualizacaoApp = ({
  createdAt,
  isEnabled,
  isEmbeddedLaunch,
}: AtualizacaoExecutada): ResumoAtualizacaoApp => {
  const dataFormatada = formatarDataAtualizacaoApp(createdAt);

  if (!isEnabled || !dataFormatada) {
    return { texto: 'Versão de desenvolvimento' };
  }

  return {
    texto: `Última atualização do app: ${dataFormatada}`,
    detalhe: isEmbeddedLaunch ? 'versão instalada' : undefined,
  };
};
