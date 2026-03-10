#include <stdio.h>
#include <string.h>
int main(){
    char s[100];scanf("%s",s);
    int l=strlen(s);
    if(s[l-1]!='0'){
        printf("%c",s[l-1]);
    }
    for(int i=1;i<l-1;i++){
        printf("%c",s[i]);
    }
    printf("%c",s[0]);
}