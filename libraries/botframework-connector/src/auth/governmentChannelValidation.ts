/**
 * @module botbuilder
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { VerifyOptions } from 'jsonwebtoken';
import { ChannelValidation } from './channelValidation';
import { ClaimsIdentity } from './claimsIdentity';
import { AuthenticationConstants } from './authenticationConstants';
import { ICredentialProvider } from './credentialProvider';
import { GovernmentConstants } from './governmentConstants';
import { JwtTokenExtractor } from './jwtTokenExtractor';

export namespace GovernmentChannelValidation {

    /**
     * TO BOT FROM GOVERNMENT CHANNEL: Token validation parameters when connecting to a bot
     */
    export const ToBotFromGovernmentChannelTokenValidationParameters: VerifyOptions = {
        issuer: [GovernmentConstants.ToBotFromChannelTokenIssuer],
        audience: undefined,                                 // Audience validation takes place manually in code.
        clockTolerance: 5 * 60,
        ignoreExpiration: false
    };

    /**
     * Validate the incoming Auth Header as a token sent from the Bot Framework Service.
     * A token issued by the Bot Framework emulator will FAIL this check.
     * @param  {string} authHeader The raw HTTP header in the format: "Bearer [longString]"
     * @param  {ICredentialProvider} credentials The user defined set of valid credentials, such as the AppId.
     * @param  {string} serviceUrl The ServiceUrl Claim value that must match in the identity.
     * @returns {Promise<ClaimsIdentity>} A valid ClaimsIdentity.
     */
    export async function authenticateChannelTokenWithServiceUrl(
        authHeader: string,
        credentials: ICredentialProvider,
        serviceUrl: string,
        channelId: string
    ): Promise<ClaimsIdentity> {

        const identity: ClaimsIdentity = await authenticateChannelToken(authHeader, credentials, channelId);

        const serviceUrlClaim: string = identity.getClaimValue(AuthenticationConstants.ServiceUrlClaim);
        if (serviceUrlClaim !== serviceUrl) {
            // Claim must match. Not Authorized.
            throw new Error('Unauthorized. ServiceUrl claim do not match.');
        }

        return identity;
    }

    /**
     * Validate the incoming Auth Header as a token sent from the Bot Framework Service.
     * A token issued by the Bot Framework emulator will FAIL this check.
     * @param  {string} authHeader The raw HTTP header in the format: "Bearer [longString]"
     * @param  {ICredentialProvider} credentials The user defined set of valid credentials, such as the AppId.
     * @returns {Promise<ClaimsIdentity>} A valid ClaimsIdentity.
     */
    export async function authenticateChannelToken(
        authHeader: string,
        credentials: ICredentialProvider,
        channelId: string
    ): Promise<ClaimsIdentity> {

        const tokenExtractor: JwtTokenExtractor = new JwtTokenExtractor(
            ToBotFromGovernmentChannelTokenValidationParameters,
            ChannelValidation.OpenIdMetadataEndpoint ?
                ChannelValidation.OpenIdMetadataEndpoint : GovernmentConstants.ToBotFromChannelOpenIdMetadataUrl,
            AuthenticationConstants.AllowedSigningAlgorithms);

        const identity: ClaimsIdentity = await tokenExtractor.getIdentityFromAuthHeader(authHeader, channelId);

        return await validateIdentity(identity, credentials);
    }

    /**
      * Validate the ClaimsIdentity to ensure it came from the channel service.
      * @param  {ClaimsIdentity} identity The identity to validate
      * @param  {ICredentialProvider} credentials The user defined set of valid credentials, such as the AppId.
      * @returns {Promise<ClaimsIdentity>} A valid ClaimsIdentity.
      */
    export async function validateIdentity(
        identity: ClaimsIdentity,
        credentials: ICredentialProvider
    ): Promise<ClaimsIdentity> {
        if (!identity) {
            // No valid identity. Not Authorized.
            throw new Error('Unauthorized. No valid identity.');
        }

        if (!identity.isAuthenticated) {
            // The token is in some way invalid. Not Authorized.
            throw new Error('Unauthorized. Is not authenticated');
        }

        // Now check that the AppID in the claimset matches
        // what we're looking for. Note that in a multi-tenant bot, this value
        // comes from developer code that may be reaching out to a service, hence the
        // Async validation.

        // Look for the "aud" claim, but only if issued from the Bot Framework
        if (identity.getClaimValue(AuthenticationConstants.IssuerClaim) !== GovernmentConstants.ToBotFromChannelTokenIssuer) {
            // The relevant Audiance Claim MUST be present. Not Authorized.
            throw new Error('Unauthorized. Issuer Claim MUST be present.');
        }

        // The AppId from the claim in the token must match the AppId specified by the developer.
        // In this case, the token is destined for the app, so we find the app ID in the audience claim.
        const audClaim: string = identity.getClaimValue(AuthenticationConstants.AudienceClaim);
        if (!(await credentials.isValidAppId(audClaim || ''))) {
            // The AppId is not valid or not present. Not Authorized.
            throw new Error(`Unauthorized. Invalid AppId passed on token: ${ audClaim }`);
        }

        return identity;
    }
}
