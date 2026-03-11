#include <stdio.h>
int main(){
    int t;scanf("%d",&t);
for(int j=1;j<=t;j++){
    printf("Test %d:\n",j);
int a,b,c;
int ar[1000],br[1000];
    scanf("%d %d %d",&a,&b,&c);
    for(int i=0;i<a;i++){
        scanf("%d",&ar[i]);
}
for(int i=0;i<b;i++){
    scanf("%d",&br[i]);
}   
    for(int i=0;i<c;i++){
        printf("%d ",ar[i]);
    }
    for(int i=0;i<b;i++){
        printf("%d ",br[i]);
    }
    for(int i=c;i<a;i++){
        printf("%d ",ar[i]);
    }
    printf("\n");

}
return 0;
}