export type Gender = "mujer" | "hombre";

export interface InvitationPayload {
  nombre: string;
  genero: Gender | "";
  profesion: string;
  email: string;
  telefono: string;
  confirmaEdad: boolean;
  sobreTi: string;
  aceptaComunicaciones: boolean;
}

export const emptyInvitation: InvitationPayload = {
  nombre: "",
  genero: "",
  profesion: "",
  email: "",
  telefono: "",
  confirmaEdad: false,
  sobreTi: "",
  aceptaComunicaciones: false,
};
