#include <stdio.h>
typedef long long ll;
int check(char s[1000]){
    for(int j=0;s[j];j++){
        if(s[j]%2!=0)return 0;
    }
    return 1;
}
int main(){
    int t;scanf("%d",&t);
for(int i=0;i<t;i++){
    char s[1000];scanf("%s",s);
    if(check(s)==1){
        printf("YES\n");
    }
    else printf("NO\n");
}
}