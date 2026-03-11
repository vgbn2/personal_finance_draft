#include <stdio.h>

int tongcs(int a){
    int sum=0;
while(a>0){
    sum+=a%10;
    a/=10;
}
return sum;
}
int main(){
    int t;
    scanf("%d",&t);
    for(int i=0;i<t;i++){
        int a;
        scanf("%d",&a);
        if(tongcs(a)%10==0){
            printf("YES\n");
        }
        else
        printf("NO\n");
    }
    return 0;
}