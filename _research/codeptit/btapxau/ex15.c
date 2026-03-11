#include <stdio.h>
#include <string.h>
#include <ctype.h>
void chuanhoa(char s[1000]) {
    s[0] = toupper(s[0]);
    for (int i = 1; i < strlen(s); i++) {
        s[i] = tolower(s[i]);
    }
}
int main() {
    int t;
    scanf("%d", &t);
    getchar();
    while (t--) {
        char s[1000], a[20][50];
        gets(s);
        s[strcspn(s, "\n")] = '\0';

        int n = 0;
        char *token = strtok(s, " ");
        while (token != NULL) {
            strcpy(a[n++], token);
            token = strtok(NULL, " ");
        }

        chuanhoa(a[n - 1]);
        printf("%s,", a[n - 1]);

        for (int i = 0; i<n-1; i++) {
            chuanhoa(a[i]);
            printf("%s", a[i]);
            if(i!=n-2)printf(" ");
        }
        printf("\n");
    }

    return 0;
}
