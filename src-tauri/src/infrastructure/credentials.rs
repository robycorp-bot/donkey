use crate::domain::{AppResult, Provider};
use zeroize::Zeroizing;

/// Credentials live only in Windows Credential Manager; there is no file fallback.
pub struct SystemCredentials;

impl SystemCredentials {
    #[cfg(windows)]
    fn entry(provider: Provider) -> AppResult<keyring::Entry> {
        keyring::Entry::new("dev.robycorp.codermegabrain", provider.id())
            .map_err(|_| "Não foi possível acessar o Gerenciador de Credenciais do Windows.".into())
    }

    pub fn get(provider: Provider) -> AppResult<Option<Zeroizing<String>>> {
        #[cfg(windows)]
        {
            match Self::entry(provider)?.get_password() {
                Ok(value) => Ok(Some(Zeroizing::new(value))),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(_) => Err(
                    "Não foi possível ler a chave no Gerenciador de Credenciais do Windows.".into(),
                ),
            }
        }
        #[cfg(not(windows))]
        {
            let _ = provider;
            Err("O armazenamento seguro de chaves desta versão requer Windows.".into())
        }
    }

    pub fn set(provider: Provider, key: &str) -> AppResult<()> {
        #[cfg(windows)]
        {
            Self::entry(provider)?.set_password(key).map_err(|_| {
                "Não foi possível salvar a chave no Gerenciador de Credenciais do Windows.".into()
            })
        }
        #[cfg(not(windows))]
        {
            let _ = (provider, key);
            Err("O armazenamento seguro de chaves desta versão requer Windows.".into())
        }
    }

    pub fn remove(provider: Provider) -> AppResult<()> {
        #[cfg(windows)]
        {
            match Self::entry(provider)?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(_) => Err(
                    "Não foi possível remover a chave do Gerenciador de Credenciais do Windows."
                        .into(),
                ),
            }
        }
        #[cfg(not(windows))]
        {
            let _ = provider;
            Err("O armazenamento seguro de chaves desta versão requer Windows.".into())
        }
    }
}
