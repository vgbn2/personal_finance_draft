#include <stdio.h>
#include <string.h>
#include <stdbool.h>
bool checktn(char s[]){
    int len=strlen(s);
    for(int i=0;i<len/2;i++){
        if(s[i]==s[len-1-i]){
            return 1;
        }
    }
    return 0;
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        char s[505];scanf("%s",s);
        int tong=0;
        for(int j=0;s[j];j++){
            tong+=s[j]-'0';
        }
        if(s[0]=='8'&&s[strlen(s)-1]=='8'&&tong%10==0&&checktn(s)){
            printf("YES\n");
        }
        else printf("NO\n");
    }
}